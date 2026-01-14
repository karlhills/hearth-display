import type { HearthDb } from "../storage/db.js";
import { getSetting, setSetting, loadState, saveState } from "../storage/db.js";
import { parseIcsEvents } from "./ics.js";

const ICS_KEY = "calendarIcsUrl";

export async function setCalendarIcsUrl(db: HearthDb, url: string) {
  await setSetting(db, ICS_KEY, url);
}

export async function getCalendarIcsUrl(db: HearthDb) {
  return getSetting(db, ICS_KEY);
}

function normalizeIcsUrl(url: string) {
  if (url.startsWith("webcal://")) {
    return `https://${url.slice("webcal://".length)}`;
  }
  return url;
}

export async function syncCalendarFromIcs(db: HearthDb, url: string) {
  const resolved = normalizeIcsUrl(url);
  const res = await fetch(resolved);
  if (!res.ok) {
    throw new Error(`Failed to fetch ICS (${res.status})`);
  }
  const text = await res.text();
  const state = await loadState(db);
  if (!state) return null;
  const events = parseIcsEvents(text, new Date(), state.calendarTimeFormat ?? "12h");
  const manualEvents = state.events.filter((event) => event.source === "manual");
  const next = {
    ...state,
    events: [...manualEvents, ...events],
    updatedAt: new Date().toISOString()
  };
  await saveState(db, next);
  return next;
}

export function startCalendarSync(db: HearthDb, onUpdate: (state: unknown) => void) {
  const run = async () => {
    const url = await getCalendarIcsUrl(db);
    if (!url) return;
    try {
      const next = await syncCalendarFromIcs(db, url);
      if (next) onUpdate(next);
    } catch (err) {
      console.error("Calendar sync failed", err);
    }
  };

  run();
  const interval = setInterval(run, 15 * 60 * 1000);
  return () => clearInterval(interval);
}
