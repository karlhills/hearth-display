import type { WeatherInfo } from "@hearth/shared";

const WEATHER_LABELS: Record<number, string> = {
  0: "Clear",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Dense drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  80: "Rain showers",
  81: "Heavy showers",
  82: "Violent showers",
  95: "Thunderstorm",
  96: "Thunderstorm w/ hail",
  99: "Thunderstorm w/ hail"
};

export type GeoResult = {
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  admin1?: string;
  timezone?: string;
};

export async function geocodeLocation(query: string) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", query);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Geocoding failed (${res.status})`);
  }

  const data = (await res.json()) as { results?: GeoResult[] };
  if (!data.results || data.results.length === 0) {
    throw new Error("No location found");
  }

  return data.results[0];
}

export async function fetchWeatherBundle(lat: number, lon: number, unit: "f" | "c") {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat.toString());
  url.searchParams.set("longitude", lon.toString());
  url.searchParams.set("current", "temperature_2m,weather_code");
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,weather_code");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("temperature_unit", unit === "f" ? "fahrenheit" : "celsius");

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Weather fetch failed (${res.status})`);
  }

  const data = (await res.json()) as {
    current?: { temperature_2m: number; weather_code: number };
    daily?: {
      time: string[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      weather_code: number[];
    };
    utc_offset_seconds?: number;
  };

  if (!data.current || !data.daily) {
    throw new Error("Weather data missing");
  }

  return { current: data.current, daily: data.daily, utcOffsetSeconds: data.utc_offset_seconds };
}

export function buildWeatherInfo(location: GeoResult, temp: number, code: number, unit: "f" | "c"): WeatherInfo {
  const summary = WEATHER_LABELS[code] ?? "Weather";
  const label = [location.name, location.admin1].filter(Boolean).join(", ");
  return {
    location: label || location.country,
    summary,
    temp: `${Math.round(temp)}°${unit.toUpperCase()}`,
    code
  };
}

function formatUtcOffset(seconds?: number) {
  if (typeof seconds !== "number" || Number.isNaN(seconds)) return "";
  if (seconds === 0) return "Z";
  const sign = seconds >= 0 ? "+" : "-";
  const totalMinutes = Math.abs(Math.round(seconds / 60));
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

export function buildForecast(
  daily: {
  time: string[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  weather_code: number[];
  },
  utcOffsetSeconds?: number
) {
  const offset = formatUtcOffset(utcOffsetSeconds);
  return daily.time.slice(0, 5).map((date, index) => {
    const code = daily.weather_code[index];
    return {
      date: offset ? `${date}T00:00:00${offset}` : date,
      high: `${Math.round(daily.temperature_2m_max[index])}°`,
      low: `${Math.round(daily.temperature_2m_min[index])}°`,
      summary: WEATHER_LABELS[code] ?? "Weather",
      code
    };
  });
}
