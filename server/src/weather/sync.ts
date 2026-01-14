import type { HearthDb } from "../storage/db.js";
import { getSetting, setSetting, loadState, saveState } from "../storage/db.js";
import { buildForecast, buildWeatherInfo, fetchWeatherBundle, geocodeLocation } from "./openMeteo.js";

const WEATHER_QUERY_KEY = "weatherQuery";

export async function setWeatherQuery(db: HearthDb, query: string) {
  await setSetting(db, WEATHER_QUERY_KEY, query);
}

export async function getWeatherQuery(db: HearthDb) {
  return getSetting(db, WEATHER_QUERY_KEY);
}

export async function syncWeather(db: HearthDb, query: string) {
  const state = await loadState(db);
  if (!state) return null;
  const unit = state.tempUnit ?? "f";
  const location = await geocodeLocation(query);
  const bundle = await fetchWeatherBundle(location.latitude, location.longitude, unit);
  const weather = buildWeatherInfo(location, bundle.current.temperature_2m, bundle.current.weather_code, unit);
  const forecast = buildForecast(bundle.daily, bundle.utcOffsetSeconds);
  const next = {
    ...state,
    weather,
    forecast,
    updatedAt: new Date().toISOString()
  };
  await saveState(db, next);
  return next;
}

export function startWeatherSync(db: HearthDb, onUpdate: (state: unknown) => void) {
  const run = async () => {
    const query = await getWeatherQuery(db);
    if (!query) return;
    try {
      const next = await syncWeather(db, query);
      if (next) onUpdate(next);
    } catch (err) {
      console.error("Weather sync failed", err);
    }
  };

  run();
  const interval = setInterval(run, 15 * 60 * 1000);
  return () => clearInterval(interval);
}
