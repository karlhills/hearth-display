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
  `);
}
