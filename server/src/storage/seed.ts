import type { HearthState } from "@hearth/shared";

function createSvgDataUrl(label: string, accent: string) {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <defs>
    <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0F172A" />
      <stop offset="100%" stop-color="${accent}" />
    </linearGradient>
  </defs>
  <rect width="1200" height="800" fill="url(#grad)" />
  <circle cx="900" cy="200" r="180" fill="rgba(255,255,255,0.08)" />
  <circle cx="250" cy="600" r="220" fill="rgba(255,255,255,0.06)" />
  <text x="80" y="700" fill="rgba(255,255,255,0.65)" font-size="64" font-family="Inter, sans-serif">${label}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function createDefaultState(): HearthState {
  const now = new Date().toISOString();
  const today = new Date();
  const formatDate = (offset: number) => {
    const next = new Date(today);
    next.setDate(today.getDate() + offset);
    return next.toISOString().slice(0, 10);
  };

  return {
    theme: "dark",
    modules: {
      calendar: true,
      photos: true,
      weather: true
    },
    calendarView: "week",
    calendarTimeFormat: "12h",
    calendarNote: "",
    tempUnit: "f",
    weatherForecastEnabled: false,
    qrEnabled: true,
    noteEnabled: true,
    noteTitle: "Family Note",
    note: "Dinner is at 6:30. Movie night after!",
    events: [
      { id: crypto.randomUUID(), title: "School pickup", date: formatDate(0), allDay: true, source: "manual" },
      { id: crypto.randomUUID(), title: "Soccer practice", date: formatDate(1), allDay: true, source: "manual" },
      { id: crypto.randomUUID(), title: "Family dinner", date: formatDate(2), allDay: true, source: "manual" }
    ],
    photos: [
      createSvgDataUrl("Hearth", "#2DD4BF"),
      createSvgDataUrl("Family", "#38BDF8"),
      createSvgDataUrl("Moments", "#818CF8")
    ],
    photosGoogle: [
      createSvgDataUrl("Hearth", "#2DD4BF"),
      createSvgDataUrl("Family", "#38BDF8"),
      createSvgDataUrl("Moments", "#818CF8")
    ],
    photosLocal: [],
    photoSources: { google: true, local: true },
    photoShuffle: true,
    photoFocus: "center",
    photoTiles: 1,
    photoTransitionMs: 12000,
    offSchedule: {
      enabled: false,
      start: "22:00",
      end: "06:00"
    },
    customTheme: {
      bg: "#0B0F14",
      surface: "#111827",
      surface2: "#0F172A",
      cardOpacity: 1,
      calendarDay: "#0F172A",
      calendarDayMuted: "rgba(15, 23, 42, 0.6)",
      calendarToday: "#111827",
      border: "rgba(255, 255, 255, 0.1)",
      text: "rgba(255, 255, 255, 0.92)",
      muted: "rgba(255, 255, 255, 0.65)",
      faint: "rgba(255, 255, 255, 0.45)",
      accent: "#2DD4BF",
      buttonText: "rgba(255, 255, 255, 0.92)",
      buttonTextOnAccent: "#0B0F14",
      backgroundImage: "",
      backgroundPosition: "center"
    },
    weather: {
      location: "Home",
      summary: "Clear and calm",
      temp: "72°F",
      code: 0
    },
    forecast: [],
    layout: {
      mode: "classic",
      sidebar: "right",
      modules: {
        calendar: { column: "left", span: 2, order: 1 },
        photos: { column: "right", span: 1, order: 2 },
        note: { column: "right", span: 1, order: 3 }
      }
    },
    updatedAt: now
  };
}

export function ensureStateDefaults(state: HearthState): HearthState {
  const defaults = createDefaultState();
  return {
    ...defaults,
    ...state,
    modules: {
      ...defaults.modules,
      ...state.modules
    },
    events: state.events.map((event) => ({
      ...event,
      source: event.source ?? "manual"
    })),
    photosGoogle: state.photosGoogle ?? state.photos ?? defaults.photosGoogle,
    photosLocal: state.photosLocal ?? [],
    photoSources: state.photoSources ?? defaults.photoSources,
    photoShuffle: state.photoShuffle ?? defaults.photoShuffle,
    photoFocus: state.photoFocus ?? defaults.photoFocus,
    photoTiles: state.photoTiles ?? defaults.photoTiles,
    photoTransitionMs: state.photoTransitionMs ?? defaults.photoTransitionMs,
    offSchedule: {
      ...defaults.offSchedule,
      ...(state.offSchedule ?? {})
    },
    customTheme: {
      ...defaults.customTheme,
      ...(state.customTheme ?? {})
    },
    layout: {
      ...defaults.layout,
      ...state.layout,
      modules: {
        ...defaults.layout.modules,
        ...(state.layout?.modules ?? {})
      }
    }
  };
}
