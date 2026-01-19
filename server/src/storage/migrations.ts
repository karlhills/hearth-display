import type { HearthDb } from "./db.js";

export async function runMigrations(db: HearthDb) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS state (
      id INTEGER PRIMARY KEY,
      json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS popups (
      id TEXT PRIMARY KEY,
      message TEXT NOT NULL,
      position TEXT NOT NULL,
      mode TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'success',
      duration_seconds INTEGER,
      visible INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT
    );
  `);

  const popupColumns = await db.all<{ name: string }[]>("PRAGMA table_info(popups)");
  const hasPriority = popupColumns.some((column) => column.name === "priority");
  if (!hasPriority) {
    await db.exec("ALTER TABLE popups ADD COLUMN priority TEXT NOT NULL DEFAULT 'success'");
  }
}
