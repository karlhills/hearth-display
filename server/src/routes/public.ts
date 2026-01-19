import type { FastifyInstance } from "fastify";
import type { HearthDb } from "../storage/db.js";
import { loadState, saveState, getSetting } from "../storage/db.js";
import { createDefaultState, ensureStateDefaults } from "../storage/seed.js";
import type { createSseManager } from "../realtime/sse.js";
import { getGoogleAccessToken, resolveCachedPhotoPath } from "../photos/google.js";
import path from "node:path";
import { createReadStream } from "node:fs";
import { getLocalPhotosDir, resolveLocalPhotoPath } from "../photos/local.js";
import os from "node:os";
import { resolveThemeBackgroundPath } from "../theme/background.js";
import { listActivePopups } from "../storage/popups.js";

export function registerPublicRoutes(
  fastify: FastifyInstance,
  { db, sse, deviceId }: { db: HearthDb; sse: ReturnType<typeof createSseManager>; deviceId: string }
) {
  const resolveLanIp = () => {
    if (process.env.LAN_IP) return process.env.LAN_IP;
    const interfaces = os.networkInterfaces();
    for (const entries of Object.values(interfaces)) {
      for (const entry of entries ?? []) {
        if (entry.family !== "IPv4" || entry.internal) continue;
        return entry.address;
      }
    }
    return null;
  };

  fastify.get("/api/state", async () => {
    const state = await loadState(db);
    if (!state) {
      const seeded = createDefaultState();
      await saveState(db, seeded);
      return {
        state: seeded,
        deviceId
      };
    }
    const normalized = ensureStateDefaults(state);
    if (JSON.stringify(state) !== JSON.stringify(normalized)) {
      await saveState(db, normalized);
    }
    return {
      state: normalized,
      deviceId
    };
  });

  fastify.get("/api/pairing", async () => {
    const code = await getSetting(db, "pairingCode");
    return { code: code ?? "" };
  });

  fastify.get("/api/popups", async () => {
    const nowIso = new Date().toISOString();
    const popups = await listActivePopups(db, nowIso);
    return { popups };
  });

  fastify.get("/api/network", async () => {
    return { lanIp: resolveLanIp() };
  });

  fastify.get("/api/display/:deviceId/events", async (request, reply) => {
    const params = request.params as { deviceId: string };
    if (params.deviceId !== deviceId) {
      reply.code(404);
      return { error: "Invalid device" };
    }

    sse.addClient(deviceId, request, reply);
    return reply;
  });

  fastify.get("/api/photos/google", async (request, reply) => {
    const { src } = request.query as { src?: string };
    if (!src) {
      reply.code(400);
      return { error: "Missing src" };
    }
    let url: URL;
    try {
      url = new URL(src);
    } catch {
      reply.code(400);
      return { error: "Invalid src" };
    }
    if (!url.hostname.endsWith("googleusercontent.com")) {
      reply.code(400);
      return { error: "Invalid host" };
    }
    const clientId = process.env.GOOGLE_PHOTOS_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_PHOTOS_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      reply.code(400);
      return { error: "Google Photos not configured" };
    }
    let accessToken = await getGoogleAccessToken(db, clientId, clientSecret);
    if (!accessToken) {
      reply.code(400);
      return { error: "Google Photos not configured" };
    }
    const withToken = (token: string) => {
      const next = new URL(url.toString());
      next.searchParams.set("access_token", token);
      return next;
    };
    let res = await fetch(withToken(accessToken).toString());
    if (res.status === 401 || res.status === 403) {
      const refreshed = await getGoogleAccessToken(db, clientId, clientSecret, true);
      if (refreshed) {
        accessToken = refreshed;
        res = await fetch(withToken(accessToken).toString());
      }
    }
    let finalRes = res;
    if (finalRes.status === 403) {
      finalRes = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
    }
    if (!finalRes.ok) {
      reply.code(finalRes.status);
      return { error: `Failed to fetch photo (${finalRes.status})` };
    }
    const contentType = finalRes.headers.get("content-type") || "image/jpeg";
    reply.header("Cache-Control", "private, max-age=300");
    reply.type(contentType);
    const buffer = Buffer.from(await finalRes.arrayBuffer());
    return reply.send(buffer);
  });

  fastify.get("/api/photos/local", async (request, reply) => {
    const { path: relPath } = request.query as { path?: string };
    if (!relPath) {
      reply.code(400);
      return { error: "Missing path" };
    }
    const directory = await getLocalPhotosDir(db);
    if (!directory) {
      reply.code(400);
      return { error: "Local photos not configured" };
    }
    let absolute: string;
    try {
      absolute = await resolveLocalPhotoPath(directory, relPath);
    } catch (err) {
      reply.code(404);
      return { error: "Photo not found" };
    }
    const ext = path.extname(absolute).toLowerCase();
    const contentType =
      ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : ext === ".png"
        ? "image/png"
        : ext === ".gif"
        ? "image/gif"
        : ext === ".webp"
        ? "image/webp"
        : ext === ".svg"
        ? "image/svg+xml"
        : "application/octet-stream";
    reply.header("Cache-Control", "public, max-age=300");
    reply.type(contentType);
    return reply.send(createReadStream(absolute));
  });

  fastify.get("/api/photos/cache", async (request, reply) => {
    const { file } = request.query as { file?: string };
    if (!file) {
      reply.code(400);
      return { error: "Missing file" };
    }
    let absolute: string;
    try {
      absolute = await resolveCachedPhotoPath(file);
    } catch {
      reply.code(404);
      return { error: "Photo not found" };
    }
    const ext = path.extname(absolute).toLowerCase();
    const contentType =
      ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : ext === ".png"
        ? "image/png"
        : ext === ".gif"
        ? "image/gif"
        : ext === ".webp"
        ? "image/webp"
        : ext === ".svg"
        ? "image/svg+xml"
        : "application/octet-stream";
    reply.header("Cache-Control", "public, max-age=86400");
    reply.type(contentType);
    return reply.send(createReadStream(absolute));
  });

  fastify.get("/api/theme/background", async (request, reply) => {
    const { file } = request.query as { file?: string };
    if (!file) {
      reply.code(400);
      return { error: "Missing file" };
    }
    let absolute: string;
    try {
      absolute = await resolveThemeBackgroundPath(file);
    } catch {
      reply.code(404);
      return { error: "Background not found" };
    }
    const ext = path.extname(absolute).toLowerCase();
    const contentType =
      ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : ext === ".png"
        ? "image/png"
        : ext === ".gif"
        ? "image/gif"
        : ext === ".webp"
        ? "image/webp"
        : "application/octet-stream";
    reply.header("Cache-Control", "public, max-age=86400");
    reply.type(contentType);
    return reply.send(createReadStream(absolute));
  });
}
