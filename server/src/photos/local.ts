import fs from "node:fs";
import path from "node:path";
import type { HearthDb } from "../storage/db.js";
import { getSetting, loadState, saveState, setSetting } from "../storage/db.js";

const LOCAL_PHOTOS_DIR_KEY = "localPhotosDir";
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"]);
const DEFAULT_LIMIT = 200;

export async function setLocalPhotosDir(db: HearthDb, directory: string) {
  await setSetting(db, LOCAL_PHOTOS_DIR_KEY, directory.trim());
}

export async function getLocalPhotosDir(db: HearthDb) {
  return getSetting(db, LOCAL_PHOTOS_DIR_KEY);
}

function normalizeRelativePath(relativePath: string) {
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  return normalized.replace(/\\/g, "/");
}

async function listImages(root: string, limit = DEFAULT_LIMIT) {
  const results: string[] = [];
  const queue: string[] = [root];

  while (queue.length && results.length < limit) {
    const current = queue.shift();
    if (!current) break;
    const entries = await fs.promises.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= limit) break;
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) continue;
      const rel = normalizeRelativePath(path.relative(root, fullPath));
      results.push(rel);
    }
  }

  return results;
}

export async function scanLocalPhotos(db: HearthDb, directory: string) {
  const root = directory.trim();
  if (!root) throw new Error("Local photos directory missing");
  if (!fs.existsSync(root)) {
    throw new Error("Local photos directory not found");
  }

  const photos = await listImages(root);
  const urls = photos.map((rel) => `/api/photos/local?path=${encodeURIComponent(rel)}`);

  const state = await loadState(db);
  if (!state) return null;
  const photosLocal = urls;
  const photosGoogle = state.photosGoogle ?? state.photos ?? [];
  const sources = state.photoSources ?? { google: true, local: true };
  const merged = [
    ...(sources.google ? photosGoogle : []),
    ...(sources.local ? photosLocal : [])
  ];
  const next = {
    ...state,
    photos: merged.length ? merged : photosLocal,
    photosGoogle,
    photosLocal,
    updatedAt: new Date().toISOString()
  };
  await saveState(db, next);
  return next;
}

export async function resolveLocalPhotoPath(directory: string, relativePath: string) {
  const root = path.resolve(directory);
  const safe = normalizeRelativePath(relativePath);
  const absolute = path.resolve(root, safe);
  if (!absolute.startsWith(root + path.sep)) {
    throw new Error("Invalid photo path");
  }
  const stat = await fs.promises.stat(absolute);
  if (!stat.isFile()) {
    throw new Error("Photo not found");
  }
  return absolute;
}
