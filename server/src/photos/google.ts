import type { HearthDb } from "../storage/db.js";
import { getSetting, setSetting, loadState, saveState } from "../storage/db.js";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const REFRESH_TOKEN_KEY = "googlePhotosRefreshToken";
const PICKER_API = "https://photospicker.googleapis.com/v1";
let cachedAccessToken: { token: string; expiresAt: number } | null = null;
const CACHE_LIMIT = 200;

export async function setGoogleRefreshToken(db: HearthDb, token: string) {
  await setSetting(db, REFRESH_TOKEN_KEY, token);
  cachedAccessToken = null;
}

export async function getGoogleRefreshToken(db: HearthDb) {
  return getSetting(db, REFRESH_TOKEN_KEY);
}

export async function clearGoogleCredentials(db: HearthDb) {
  await setSetting(db, REFRESH_TOKEN_KEY, "");
  cachedAccessToken = null;
}

export async function exchangeCodeForToken(clientId: string, clientSecret: string, code: string, redirectUri: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    })
  });
  if (!res.ok) {
    throw new Error("Failed to exchange code");
  }
  return (await res.json()) as { refresh_token?: string };
}

export async function refreshAccessToken(clientId: string, clientSecret: string, refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });
  if (!res.ok) {
    throw new Error("Failed to refresh token");
  }
  return (await res.json()) as { access_token: string; expires_in: number };
}

export async function getGoogleAccessToken(db: HearthDb, clientId: string, clientSecret: string, forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedAccessToken && cachedAccessToken.expiresAt > now + 30_000) {
    return cachedAccessToken.token;
  }
  const refreshToken = await getGoogleRefreshToken(db);
  if (!refreshToken) return null;
  const token = await refreshAccessToken(clientId, clientSecret, refreshToken);
  cachedAccessToken = {
    token: token.access_token,
    expiresAt: now + token.expires_in * 1000
  };
  return token.access_token;
}

export function getGoogleCacheDir() {
  const configured = process.env.GOOGLE_PHOTOS_CACHE_DIR?.trim();
  if (configured) return configured;
  if (process.env.DATA_PATH?.startsWith("/data")) {
    return "/data/google-cache";
  }
  return path.resolve(process.cwd(), "data/google-cache");
}

function normalizeRelativePath(relativePath: string) {
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  return normalized.replace(/\\/g, "/");
}

export async function resolveCachedPhotoPath(fileName: string) {
  const root = path.resolve(getGoogleCacheDir());
  const safe = normalizeRelativePath(fileName);
  const absolute = path.resolve(root, safe);
  if (!absolute.startsWith(root + path.sep)) {
    throw new Error("Invalid photo path");
  }
  const stat = await fs.stat(absolute);
  if (!stat.isFile()) {
    throw new Error("Photo not found");
  }
  return absolute;
}

async function cachePhoto(accessToken: string, baseUrl: string) {
  const cacheDir = getGoogleCacheDir();
  await fs.mkdir(cacheDir, { recursive: true });
  const hash = crypto.createHash("sha1").update(baseUrl).digest("hex");
  const filename = `${hash}.jpg`;
  const filePath = path.join(cacheDir, filename);
  try {
    await fs.stat(filePath);
    return filename;
  } catch {
    // continue
  }
  const url = new URL(baseUrl);
  url.searchParams.set("access_token", accessToken);
  const res = await fetch(url.toString());
  if (!res.ok) {
    return null;
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(filePath, buffer);
  return filename;
}

export async function fetchTokenInfo(accessToken: string) {
  const url = new URL("https://oauth2.googleapis.com/tokeninfo");
  url.searchParams.set("access_token", accessToken);
  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed tokeninfo (${res.status}): ${body}`);
  }
  return (await res.json()) as { scope?: string };
}

export async function createPickerSession(accessToken: string, requestId?: string) {
  const url = new URL(`${PICKER_API}/sessions`);
  if (requestId) url.searchParams.set("requestId", requestId);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create picker session (${res.status}): ${body}`);
  }
  return (await res.json()) as { id?: string; sessionId?: string; name?: string; pickerUri?: string; mediaItemsSet?: boolean };
}

export async function getPickerSession(accessToken: string, sessionId: string) {
  const res = await fetch(`${PICKER_API}/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to get session (${res.status}): ${body}`);
  }
  return (await res.json()) as { mediaItemsSet?: boolean };
}

export async function listPickerMediaItems(accessToken: string, sessionId: string) {
  const url = new URL(`${PICKER_API}/mediaItems`);
  url.searchParams.set("sessionId", sessionId);
  url.searchParams.set("pageSize", "100");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to list picker media (${res.status}): ${body}`);
  }
  return (await res.json()) as {
    mediaItems?: Array<{
      baseUrl?: string;
      mimeType?: string;
      mediaFile?: { baseUrl?: string; mimeType?: string };
      mediaItem?: { baseUrl?: string; mimeType?: string };
    }>;
  };
}

export function resolveSessionId(session: { id?: string; sessionId?: string; name?: string }) {
  if (session.sessionId) return session.sessionId;
  if (session.id) return session.id;
  if (session.name) {
    const parts = session.name.split("/");
    return parts[parts.length - 1];
  }
  return "";
}

export async function syncGooglePhotosFromPicker(db: HearthDb, clientId: string, clientSecret: string, sessionId: string) {
  const accessToken = await getGoogleAccessToken(db, clientId, clientSecret);
  if (!accessToken) return null;

  const media = await listPickerMediaItems(accessToken, sessionId);
  const photos = (media.mediaItems ?? [])
    .map((item) => ({
      baseUrl: item.mediaFile?.baseUrl ?? item.baseUrl ?? item.mediaItem?.baseUrl,
      mimeType: item.mediaFile?.mimeType ?? item.mimeType ?? item.mediaItem?.mimeType
    }))
    .filter((item) => item.baseUrl && item.mimeType?.startsWith("image/") !== false)
    .map((item) => `${item.baseUrl}=w1600-h900-c`)
    .slice(0, CACHE_LIMIT);

  const cachedFiles: string[] = [];
  for (const photoUrl of photos) {
    const cached = await cachePhoto(accessToken, photoUrl);
    if (cached) {
      cachedFiles.push(cached);
    }
  }
  const cachedUrls = cachedFiles.map((file) => `/api/photos/cache?file=${encodeURIComponent(file)}`);

  const state = await loadState(db);
  if (!state) return null;
  const photosGoogle = cachedUrls.length ? cachedUrls : photos;
  const photosLocal = state.photosLocal ?? [];
  const sources = state.photoSources ?? { google: true, local: true };
  const merged = [
    ...(sources.google ? photosGoogle : []),
    ...(sources.local ? photosLocal : [])
  ];
  const next = {
    ...state,
    photos: merged.length ? merged : photosGoogle,
    photosGoogle,
    photosLocal,
    updatedAt: new Date().toISOString()
  };
  await saveState(db, next);
  return next;
}
