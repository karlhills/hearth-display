import fs from "node:fs/promises";
import path from "node:path";
import { open, type Database } from "sqlite";
import sqlite3 from "sqlite3";
import type { HearthState } from "@hearth/shared";
import { runMigrations } from "./migrations.js";

export type HearthDb = Database<sqlite3.Database, sqlite3.Statement>;

export async function initDb(filename: string) {
  const dir = path.dirname(filename);
  await fs.mkdir(dir, { recursive: true });
  const db = await open({
    filename,
    driver: sqlite3.Database
  });

  await runMigrations(db);

  return db;
}

export async function getSetting(db: HearthDb, key: string) {
  const row = await db.get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key);
  return row?.value ?? null;
}

export async function setSetting(db: HearthDb, key: string, value: string) {
  await db.run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value);
}

export async function loadState(db: HearthDb): Promise<HearthState | null> {
  const row = await db.get<{ json: string }>("SELECT json FROM state WHERE id = 1");
  if (!row) return null;
  return JSON.parse(row.json) as HearthState;
}

export async function saveState(db: HearthDb, state: HearthState) {
  const json = JSON.stringify(state);
  await db.run("INSERT INTO state (id, json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json", json);
}
