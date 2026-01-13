import type { FastifyInstance } from "fastify";
import type { HearthDb } from "../storage/db.js";
import { loadState, saveState } from "../storage/db.js";
import { stateUpdateSchema, toggleModuleSchema, layoutUpdateSchema, pairingSchema } from "@hearth/shared";
import type { createSseManager } from "../realtime/sse.js";
import { signToken, verifyToken } from "../auth/token.js";
import type { HearthState } from "@hearth/shared";
import { getCalendarIcsUrl, setCalendarIcsUrl, syncCalendarFromIcs } from "../calendar/sync.js";
import { ensureStateDefaults } from "../storage/seed.js";
import { getWeatherQuery, setWeatherQuery, syncWeather } from "../weather/sync.js";
import { clearGoogleCredentials, createPickerSession, exchangeCodeForToken, fetchTokenInfo, getGoogleRefreshToken, getPickerSession, refreshAccessToken, resolveSessionId, setGoogleRefreshToken, syncGooglePhotosFromPicker } from "../photos/google.js";
import { getLocalPhotosDir, scanLocalPhotos, setLocalPhotosDir } from "../photos/local.js";
import { clearThemeBackground, saveThemeBackground } from "../theme/background.js";

function requireAuth(secret: string, authHeader?: string) {
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  try {
    verifyToken(secret, token);
    return true;
  } catch (err) {
    return false;
  }
}

function requireAuthFromRequest(secret: string, request: { headers: { authorization?: string }; query?: unknown }) {
  if (requireAuth(secret, request.headers.authorization)) return true;
  const query = request.query as { token?: string } | undefined;
  if (!query?.token) return false;
  try {
    verifyToken(secret, query.token);
    return true;
  } catch {
    return false;
  }
}

type PartialStateUpdate = Partial<HearthState> & {
  modules?: Partial<HearthState["modules"]>;
  weather?: Partial<HearthState["weather"]>;
};

function mergeState(current: HearthState, partial: PartialStateUpdate) {
  return {
    ...current,
    ...partial,
    modules: {
      ...current.modules,
      ...(partial.modules ?? {})
    },
    weather: {
      ...current.weather,
      ...(partial.weather ?? {})
    },
    layout: partial.layout ?? current.layout,
    updatedAt: new Date().toISOString()
  };
}

export function registerControlRoutes(
  fastify: FastifyInstance,
  { db, sse, tokenSecret }: { db: HearthDb; sse: ReturnType<typeof createSseManager>; tokenSecret: string }
) {
  fastify.post("/api/control/pair", async (request, reply) => {
    const body = pairingSchema.parse(request.body);
    const storedCode = await db.get<{ value: string }>("SELECT value FROM settings WHERE key = ?", "pairingCode");
    if (!storedCode || storedCode.value !== body.code) {
      reply.code(401);
      return { error: "Invalid code" };
    }

    const token = signToken(tokenSecret);
    return { token };
  });

  fastify.post("/api/control/state", async (request, reply) => {
    if (!requireAuth(tokenSecret, request.headers.authorization)) {
      reply.code(401);
      return { error: "Unauthorized" };
    }

    const body = request.body as { state?: Partial<HearthState> };
    const parsed = stateUpdateSchema.parse(body.state ?? {}) as PartialStateUpdate;
    const currentRaw = await loadState(db);
    const current = currentRaw ? ensureStateDefaults(currentRaw) : null;
    if (!current) {
      reply.code(500);
      return { error: "State missing" };
    }

    const next = mergeState(current, parsed);
    await saveState(db, next);
    sse.broadcastAll(next);
    return next;
  });

  fastify.post("/api/control/modules/toggle", async (request, reply) => {
    if (!requireAuth(tokenSecret, request.headers.authorization)) {
      reply.code(401);
      return { error: "Unauthorized" };
    }

    const body = toggleModuleSchema.parse(request.body);
    const currentRaw = await loadState(db);
    const current = currentRaw ? ensureStateDefaults(currentRaw) : null;
    if (!current) {
      reply.code(500);
      return { error: "State missing" };
    }

    const next = mergeState(current, {
      modules: { ...current.modules, [body.module]: body.enabled }
    });
    await saveState(db, next);
    sse.broadcastAll(next);
    return next;
  });

  fastify.post("/api/control/layout", async (request, reply) => {
    if (!requireAuth(tokenSecret, request.headers.authorization)) {
      reply.code(401);
      return { error: "Unauthorized" };
    }

    const body = layoutUpdateSchema.parse(request.body);
    const currentRaw = await loadState(db);
    const current = currentRaw ? ensureStateDefaults(currentRaw) : null;
    if (!current) {
      reply.code(500);
      return { error: "State missing" };
    }

    const next = mergeState(current, { layout: body.layout });
    await saveState(db, next);
    sse.broadcastAll(next);
    return next;
  });

  fastify.get("/api/control/calendar/settings", async (request, reply) => {
    if (!requireAuth(tokenSecret, request.headers.authorization)) {
      reply.code(401);
      return { error: "Unauthorized" };
    }
    const url = await getCalendarIcsUrl(db);
    return { icsUrl: url ?? "" };
  });

  fastify.post("/api/control/calendar/settings", async (request, reply) => {
    if (!requireAuth(tokenSecret, request.headers.authorization)) {
      reply.code(401);
      return { error: "Unauthorized" };
    }
    const body = request.body as { icsUrl?: string; syncNow?: boolean };
    const url = body.icsUrl?.trim();
    if (url) {
      await setCalendarIcsUrl(db, url);
    }

    if (body.syncNow && url) {
      const next = await syncCalendarFromIcs(db, url);
      if (next) {
        sse.broadcastAll(next);
      }
    }

    return { ok: true };
  });

  fastify.get("/api/control/weather/settings", async (request, reply) => {
    if (!requireAuth(tokenSecret, request.headers.authorization)) {
      reply.code(401);
      return { error: "Unauthorized" };
    }
    const query = await getWeatherQuery(db);
    return { query: query ?? "" };
  });

  fastify.post("/api/control/weather/settings", async (request, reply) => {
    if (!requireAuth(tokenSecret, request.headers.authorization)) {
      reply.code(401);
      return { error: "Unauthorized" };
    }
    const body = request.body as { query?: string; syncNow?: boolean };
    const query = body.query?.trim();
    if (query) {
      await setWeatherQuery(db, query);
    }
    if (body.syncNow && query) {
      const next = await syncWeather(db, query);
      if (next) sse.broadcastAll(next);
    }
    return { ok: true };
  });

  fastify.get("/api/control/photos/google/status", async (request, reply) => {
    if (!requireAuth(tokenSecret, request.headers.authorization)) {
      reply.code(401);
      return { error: "Unauthorized" };
    }
    const token = await getGoogleRefreshToken(db);
    return { connected: Boolean(token) };
  });

  fastify.get("/api/control/photos/google/auth", async (request, reply) => {
    if (!requireAuthFromRequest(tokenSecret, request)) {
      reply.code(401);
      return { error: "Unauthorized" };
    }
    const clientId = process.env.GOOGLE_PHOTOS_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_PHOTOS_REDIRECT_URI || `http://localhost:${process.env.PORT || 8787}/api/control/photos/google/callback`;
    if (!clientId) {
      reply.code(400);
      return { error: "Google Photos client ID missing" };
    }
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "https://www.googleapis.com/auth/photospicker.mediaitems.readonly");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("include_granted_scopes", "true");
    const token = (request.query as { token?: string }).token;
    if (token) {
      url.searchParams.set("state", token);
    }
    reply.redirect(url.toString());
  });

  fastify.get("/api/control/photos/google/callback", async (request, reply) => {
    const query = request.query as { code?: string; state?: string };
    const code = query.code;
    const clientId = process.env.GOOGLE_PHOTOS_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_PHOTOS_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_PHOTOS_REDIRECT_URI || `http://localhost:${process.env.PORT || 8787}/api/control/photos/google/callback`;
    if (!code || !clientId || !clientSecret) {
      reply.code(400);
      return { error: "Missing OAuth configuration" };
    }
    const tokens = await exchangeCodeForToken(clientId, clientSecret, code, redirectUri);
    if (!tokens.refresh_token) {
      reply.code(400);
      return { error: "No refresh token returned" };
    }
    await setGoogleRefreshToken(db, tokens.refresh_token);
    const finalTarget =
      process.env.DEV_CONTROL_ORIGIN?.trim() ||
      "/control/";
    if (query.state) {
      const target = finalTarget.startsWith("http") ? finalTarget : "/control/";
      reply.type("text/html").send(`<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Hearth</title></head>
  <body>
    <script>
      localStorage.setItem("hearth-token", ${JSON.stringify(query.state)});
      window.location.href = ${JSON.stringify(target)};
    </script>
  </body>
</html>`);
      return;
    }
    reply.redirect(finalTarget);
  });

  fastify.get("/api/control/photos/google/scopes", async (request, reply) => {
    if (!requireAuth(tokenSecret, request.headers.authorization)) {
      reply.code(401);
      return { error: "Unauthorized" };
    }
    const refreshToken = await getGoogleRefreshToken(db);
    const clientId = process.env.GOOGLE_PHOTOS_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_PHOTOS_CLIENT_SECRET;
    if (!refreshToken || !clientId || !clientSecret) {
      reply.code(400);
      return { error: "Google Photos not configured" };
    }
    const token = await refreshAccessToken(clientId, clientSecret, refreshToken);
    const info = await fetchTokenInfo(token.access_token);
    return { scopes: info.scope ?? "" };
  });

  fastify.post("/api/control/photos/picker/session", async (request, reply) => {
    if (!requireAuth(tokenSecret, request.headers.authorization)) {
      reply.code(401);
      return { error: "Unauthorized" };
    }
    const refreshToken = await getGoogleRefreshToken(db);
    const clientId = process.env.GOOGLE_PHOTOS_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_PHOTOS_CLIENT_SECRET;
    if (!refreshToken || !clientId || !clientSecret) {
      reply.code(400);
      return { error: "Google Photos not configured" };
    }
    const token = await refreshAccessToken(clientId, clientSecret, refreshToken);
    const session = await createPickerSession(token.access_token);
    const sessionId = resolveSessionId(session);
    return { sessionId, pickerUri: session.pickerUri ?? "" };
  });

  fastify.get("/api/control/photos/picker/session/:sessionId", async (request, reply) => {
    if (!requireAuth(tokenSecret, request.headers.authorization)) {
      reply.code(401);
      return { error: "Unauthorized" };
    }
    const { sessionId } = request.params as { sessionId: string };
    const refreshToken = await getGoogleRefreshToken(db);
    const clientId = process.env.GOOGLE_PHOTOS_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_PHOTOS_CLIENT_SECRET;
    if (!refreshToken || !clientId || !clientSecret) {
      reply.code(400);
      return { error: "Google Photos not configured" };
    }
    const token = await refreshAccessToken(clientId, clientSecret, refreshToken);
    const session = await getPickerSession(token.access_token, sessionId);
    return { mediaItemsSet: Boolean(session.mediaItemsSet) };
  });

  fastify.post("/api/control/photos/picker/complete", async (request, reply) => {
    if (!requireAuth(tokenSecret, request.headers.authorization)) {
      reply.code(401);
      return { error: "Unauthorized" };
    }
    const body = request.body as { sessionId?: string };
    if (!body.sessionId) {
      reply.code(400);
      return { error: "Missing sessionId" };
    }
    const clientId = process.env.GOOGLE_PHOTOS_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_PHOTOS_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      reply.code(400);
      return { error: "Google Photos not configured" };
    }
    const next = await syncGooglePhotosFromPicker(db, clientId, clientSecret, body.sessionId);
    if (next) sse.broadcastAll(next);
    return { ok: true };
  });

  fastify.post("/api/control/photos/google/disconnect", async (request, reply) => {
    if (!requireAuth(tokenSecret, request.headers.authorization)) {
      reply.code(401);
      return { error: "Unauthorized" };
    }
    await clearGoogleCredentials(db);
    return { ok: true };
  });

  fastify.get("/api/control/photos/local/settings", async (request, reply) => {
    if (!requireAuth(tokenSecret, request.headers.authorization)) {
      reply.code(401);
      return { error: "Unauthorized" };
    }
    const directory = await getLocalPhotosDir(db);
    return { directory: directory ?? "" };
  });

  fastify.post("/api/control/photos/local/settings", async (request, reply) => {
    if (!requireAuth(tokenSecret, request.headers.authorization)) {
      reply.code(401);
      return { error: "Unauthorized" };
    }
    const body = request.body as { directory?: string };
    const directory = body.directory?.trim() ?? "";
    await setLocalPhotosDir(db, directory);
    return { ok: true };
  });

  fastify.post("/api/control/photos/local/scan", async (request, reply) => {
    if (!requireAuth(tokenSecret, request.headers.authorization)) {
      reply.code(401);
      return { error: "Unauthorized" };
    }
    const body = request.body as { directory?: string };
    const directory = body.directory?.trim() || (await getLocalPhotosDir(db));
    if (!directory) {
      reply.code(400);
      return { error: "Directory required" };
    }
    await setLocalPhotosDir(db, directory);
    const next = await scanLocalPhotos(db, directory);
    if (next) sse.broadcastAll(next);
    return { ok: true };
  });

  fastify.post("/api/control/theme/background", async (request, reply) => {
    if (!requireAuth(tokenSecret, request.headers.authorization)) {
      reply.code(401);
      return { error: "Unauthorized" };
    }
    const body = request.body as { dataUrl?: string; clear?: boolean };
    if (body.clear) {
      await clearThemeBackground();
      const currentRaw = await loadState(db);
      const current = currentRaw ? ensureStateDefaults(currentRaw) : null;
      if (!current) {
        reply.code(500);
        return { error: "State missing" };
      }
      const next = mergeState(current, {
        customTheme: { ...current.customTheme, backgroundImage: "" }
      });
      await saveState(db, next);
      sse.broadcastAll(next);
      return { url: "" };
    }
    if (!body.dataUrl) {
      reply.code(400);
      return { error: "Missing dataUrl" };
    }
    const currentRaw = await loadState(db);
    const current = currentRaw ? ensureStateDefaults(currentRaw) : null;
    if (!current) {
      reply.code(500);
      return { error: "State missing" };
    }
    const saved = await saveThemeBackground(body.dataUrl);
    const url = `/api/theme/background?file=${encodeURIComponent(saved.filename)}&v=${Date.now()}`;
    const next = mergeState(current, {
      customTheme: { ...current.customTheme, backgroundImage: url }
    });
    await saveState(db, next);
    sse.broadcastAll(next);
    return { url };
  });
}
