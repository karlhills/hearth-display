import fs from "node:fs/promises";
import path from "node:path";

const IMAGE_MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif"
};

export function getThemeAssetsDir() {
  const configured = process.env.THEME_ASSETS_DIR?.trim();
  if (configured) return configured;
  if (process.env.DATA_PATH?.startsWith("/data")) {
    return "/data/theme";
  }
  return path.resolve(process.cwd(), "data/theme");
}

export async function saveThemeBackground(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid data URL");
  }
  const mime = match[1];
  const body = match[2];
  const ext = IMAGE_MIME_EXT[mime];
  if (!ext) {
    throw new Error("Unsupported image type");
  }
  const buffer = Buffer.from(body, "base64");
  const dir = getThemeAssetsDir();
  await fs.mkdir(dir, { recursive: true });
  const filename = `custom-bg.${ext}`;
  const fullPath = path.join(dir, filename);
  await fs.writeFile(fullPath, buffer);
  return { filename };
}

export async function clearThemeBackground() {
  const dir = getThemeAssetsDir();
  try {
    const entries = await fs.readdir(dir);
    await Promise.all(
      entries
        .filter((name) => name.startsWith("custom-bg."))
        .map((name) => fs.unlink(path.join(dir, name)))
    );
  } catch {
    // ignore
  }
}

export async function resolveThemeBackgroundPath(file: string) {
  const dir = path.resolve(getThemeAssetsDir());
  const safe = path.normalize(file).replace(/^(\.\.(\/|\\|$))+/, "").replace(/\\/g, "/");
  const fullPath = path.resolve(dir, safe);
  if (!fullPath.startsWith(dir + path.sep)) {
    throw new Error("Invalid background path");
  }
  const stat = await fs.stat(fullPath);
  if (!stat.isFile()) {
    throw new Error("Background not found");
  }
  return fullPath;
}
