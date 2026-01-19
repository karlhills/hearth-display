import type { HearthDb } from "./db.js";
import type { Popup } from "@hearth/shared";

type PopupRow = {
  id: string;
  message: string;
  position: string;
  mode: string;
  priority: string | null;
  duration_seconds: number | null;
  visible: number;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
};

function mapPopupRow(row: PopupRow): Popup {
  return {
    id: row.id,
    message: row.message,
    position: row.position as Popup["position"],
    mode: row.mode as Popup["mode"],
    priority: (row.priority as Popup["priority"]) ?? "success",
    durationSeconds: row.duration_seconds ?? undefined,
    visible: Boolean(row.visible),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at ?? null
  };
}

export async function listActivePopups(db: HearthDb, nowIso: string) {
  const rows = await db.all<PopupRow[]>(
    "SELECT * FROM popups WHERE visible = 1 AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at ASC",
    nowIso
  );
  return rows.map(mapPopupRow);
}

export async function getPopup(db: HearthDb, id: string) {
  const row = await db.get<PopupRow>("SELECT * FROM popups WHERE id = ?", id);
  if (!row) return null;
  return mapPopupRow(row);
}

export async function insertPopup(db: HearthDb, popup: Popup) {
  await db.run(
    `INSERT INTO popups
      (id, message, position, mode, priority, duration_seconds, visible, created_at, updated_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    popup.id,
    popup.message,
    popup.position,
    popup.mode,
    popup.priority,
    popup.durationSeconds ?? null,
    popup.visible ? 1 : 0,
    popup.createdAt,
    popup.updatedAt,
    popup.expiresAt ?? null
  );
}

export async function updatePopup(db: HearthDb, popup: Popup) {
  await db.run(
    `UPDATE popups
      SET message = ?, position = ?, mode = ?, priority = ?, duration_seconds = ?, visible = ?, updated_at = ?, expires_at = ?
      WHERE id = ?`,
    popup.message,
    popup.position,
    popup.mode,
    popup.priority,
    popup.durationSeconds ?? null,
    popup.visible ? 1 : 0,
    popup.updatedAt,
    popup.expiresAt ?? null,
    popup.id
  );
}

export async function clearPopups(db: HearthDb, nowIso: string) {
  await db.run("UPDATE popups SET visible = 0, updated_at = ?, expires_at = ?", nowIso, nowIso);
}
