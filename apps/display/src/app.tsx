import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { HearthState, PublicStateResponse } from "@hearth/shared";
import { Card, SectionHeader } from "@hearth/ui";
import { subscribeToState } from "./sse";

const fallbackState: HearthState = {
  theme: "dark",
  modules: { calendar: true, photos: true, weather: true },
  calendarView: "week",
  tempUnit: "f",
  weatherForecastEnabled: false,
  qrEnabled: true,
  noteTitle: "Family Note",
  note: "",
  events: [],
  photos: [],
  photosGoogle: [],
  photosLocal: [],
  photoSources: { google: true, local: true },
  photoShuffle: true,
  photoFocus: "center",
  customTheme: {
    bg: "#0B0F14",
    surface: "#111827",
    surface2: "#0F172A",
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
  weather: { location: "", summary: "", temp: "", code: 0 },
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
  updatedAt: new Date().toISOString()
};

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(date: Date) {
  return date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

function iconClassForCode(code: number) {
  if (code === 0) return "wi-day-sunny";
  if (code >= 1 && code <= 3) return "wi-day-cloudy";
  if (code === 45 || code === 48) return "wi-fog";
  if ((code >= 51 && code <= 55) || (code >= 80 && code <= 82)) return "wi-showers";
  if (code >= 61 && code <= 65) return "wi-rain";
  if (code >= 71 && code <= 75) return "wi-snow";
  if (code >= 95) return "wi-thunderstorm";
  return "wi-cloudy";
}

function applyTheme(theme: HearthState["theme"], customTheme: HearthState["customTheme"]) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  const keys = [
    "bg",
    "surface",
    "surface2",
    "calendarDay",
    "calendarDayMuted",
    "calendarToday",
    "border",
    "text",
    "muted",
    "faint",
    "accent",
    "buttonText",
    "buttonTextOnAccent"
  ] as const;
  if (theme === "custom") {
    keys.forEach((key) => {
      const cssKey = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
      root.style.setProperty(`--${cssKey}`, customTheme[key]);
    });
    root.style.setProperty("--bg-image", customTheme.backgroundImage ? `url("${customTheme.backgroundImage}")` : "none");
    const positions: Record<HearthState["photoFocus"], string> = {
      none: "center",
      center: "center",
      top: "top",
      bottom: "bottom",
      left: "left",
      right: "right",
      "top-left": "top left",
      "top-right": "top right",
      "bottom-left": "bottom left",
      "bottom-right": "bottom right"
    };
    root.style.setProperty("--bg-position", positions[customTheme.backgroundPosition ?? "center"]);
  } else {
    keys.forEach((key) => {
      const cssKey = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
      root.style.removeProperty(`--${cssKey}`);
    });
    root.style.removeProperty("--bg-image");
    root.style.removeProperty("--bg-position");
  }
}

function EventTitle({ title }: { title: string }) {
  const [shouldScroll, setShouldScroll] = useState(false);
  const [marqueeDuration, setMarqueeDuration] = useState(12);
  const [marqueeDistance, setMarqueeDistance] = useState(0);
  const [measureKey, setMeasureKey] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLSpanElement | null>(null);

  useLayoutEffect(() => {
    setMeasureKey((key) => key + 1);
  }, [title]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;
    const check = () => {
      const overflow = measure.scrollWidth > container.clientWidth + 1;
      setShouldScroll(overflow);
      if (overflow) {
        const distance = measure.scrollWidth + 24;
        const duration = Math.max(12, Math.round((distance + container.clientWidth) / 16));
        setMarqueeDuration(duration);
        setMarqueeDistance(distance);
      }
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(container);
    return () => observer.disconnect();
  }, [measureKey]);

  return (
    <div ref={containerRef} className="hearth-title-wrap">
      {shouldScroll ? (
        <div className="hearth-marquee-wrap">
          <span
            className="hearth-marquee-single"
            style={{
              animationDuration: `${marqueeDuration}s`,
              ["--marquee-distance" as string]: `${marqueeDistance}px`,
              ["--marquee-container" as string]: `${containerRef.current?.clientWidth ?? 0}px`
            }}
          >
            {title}
          </span>
        </div>
      ) : (
        <div className="hearth-ellipsis">
          <span className="hearth-ellipsis-text">{title}</span>
        </div>
      )}
      <span ref={measureRef} key={measureKey} className="hearth-measure">
        {title}
      </span>
    </div>
  );
}

export function App() {
  const [now, setNow] = useState(() => new Date());
  const [state, setState] = useState<HearthState>(fallbackState);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [controlQr, setControlQr] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<string>("loading");
  const [lanIp, setLanIp] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);

  const deviceIdFromUrl = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("device");
  }, []);

  const controlOrigin = useMemo(() => {
    const host = lanIp || window.location.hostname;
    const isDevDisplay = window.location.port === "5173";
    const port = isDevDisplay
      ? "5174"
      : window.location.port && window.location.port !== "8787"
      ? window.location.port
      : "8787";
    return `${window.location.protocol}//${host}${port ? `:${port}` : ""}`;
  }, [lanIp]);

  const controlUrl = useMemo(() => {
    const base = `${controlOrigin}/control/`;
    if (!pairingCode) return base;
    return `${base}?pair=${encodeURIComponent(pairingCode)}`;
  }, [controlOrigin, pairingCode]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let active = true;

    fetch("/api/state")
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Failed to load state");
        }
        return (await res.json()) as PublicStateResponse;
      })
      .then((data) => {
        if (!active) return;
        setState(data.state);
        setDeviceId(data.deviceId);
        applyTheme(data.state.theme, data.state.customTheme);
        if (deviceIdFromUrl && deviceIdFromUrl !== data.deviceId) {
          setError("This display URL does not match the registered device.");
        }
      })
      .catch((err) => {
        console.error(err);
        setError("Unable to reach Hearth server.");
      });

    fetch("/api/network")
      .then(async (res) => {
        if (!res.ok) return { lanIp: null };
        return (await res.json()) as { lanIp: string | null };
      })
      .then((data) => {
        if (!active) return;
        if (data.lanIp) {
          setLanIp(data.lanIp);
        }
      })
      .catch((err) => {
        console.error(err);
      });

    fetch("/api/pairing")
      .then(async (res) => {
        if (!res.ok) return { code: "" };
        return (await res.json()) as { code: string };
      })
      .then((data) => {
        if (!active) return;
        if (data.code) {
          setPairingCode(data.code);
        }
      })
      .catch((err) => {
        console.error(err);
      });

    return () => {
      active = false;
    };
  }, [deviceIdFromUrl]);

  useEffect(() => {
    if (!deviceIdFromUrl) return;
    if (error) return;

    const unsubscribe = subscribeToState(deviceIdFromUrl, (next) => {
      setState(next);
      applyTheme(next.theme, next.customTheme);
    });

    return () => {
      unsubscribe();
    };
  }, [deviceIdFromUrl, error]);

  const mergedPhotos = useMemo(() => {
    const sources = state.photoSources ?? { google: true, local: true };
    const base = [
      ...(sources.google ? state.photosGoogle ?? [] : []),
      ...(sources.local ? state.photosLocal ?? [] : [])
    ];
    const fallback = state.photos ?? [];
    const list = base.length ? base : fallback;
    if (!state.photoShuffle) return list;
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }, [state.photoSources, state.photosGoogle, state.photosLocal, state.photos, state.photoShuffle]);

  useEffect(() => {
    if (!mergedPhotos.length) return;
    const interval = setInterval(() => {
      setPhotoIndex((idx) => (idx + 1) % mergedPhotos.length);
    }, 10000);
    return () => clearInterval(interval);
  }, [mergedPhotos]);

  useEffect(() => {
    let active = true;
    import("qrcode")
      .then((module) => module.toDataURL(controlUrl, { width: 96, margin: 1 }))
      .then((url) => {
        if (active) {
          setControlQr(url);
          setQrStatus("ready");
        }
      })
      .catch((err) => {
        console.error("Failed to generate QR", err);
        setQrStatus("error");
      });
    return () => {
      active = false;
    };
  }, [controlUrl]);

  const resolvedDeviceId = deviceId ?? "";

  if (!deviceIdFromUrl) {
    return (
      <div className="min-h-screen hearth-bg p-12 text-text">
        <div className="mx-auto max-w-2xl">
          <Card>
            <SectionHeader title="Hearth Display" />
            <div className="mt-6 text-lg">Open the display on your TV with this URL:</div>
            <div className="mt-4 rounded-xl border border-border bg-surface2 px-4 py-3 text-lg">
              {resolvedDeviceId
                ? `${displayOrigin}/display/?device=${resolvedDeviceId}`
                : "Waiting for server..."}
            </div>
            <div className="mt-6 text-sm text-muted">
              Pair from your phone at /control and keep this tab open on the TV.
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen hearth-bg p-12 text-text">
        <div className="mx-auto max-w-2xl">
          <Card>
            <SectionHeader title="Hearth Display" />
            <div className="mt-6 text-lg">{error}</div>
            <div className="mt-4 text-sm text-muted">
              Check the device URL or pair a new display from /control.
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const activePhoto = mergedPhotos[photoIndex];

  const resolvePhotoUrl = (photoUrl: string) => {
    if (!photoUrl) return photoUrl;
    if (photoUrl.startsWith("/api/photos/google")) return photoUrl;
    if (photoUrl.includes("googleusercontent.com")) {
      return `/api/photos/google?src=${encodeURIComponent(photoUrl)}`;
    }
    return photoUrl;
  };

  const focusMap: Record<HearthState["photoFocus"], string> = {
    none: "center",
    center: "center",
    top: "top",
    bottom: "bottom",
    left: "left",
    right: "right",
    "top-left": "top left",
    "top-right": "top right",
    "bottom-left": "bottom left",
    "bottom-right": "bottom right"
  };
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());

  const weekDays = Array.from({ length: 7 }, (_, idx) => {
    const day = new Date(startOfWeek);
    day.setDate(startOfWeek.getDate() + idx);
    return day;
  });

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthGridStart = new Date(monthStart);
  monthGridStart.setDate(monthStart.getDate() - monthStart.getDay());
  const monthDays = Array.from({ length: 42 }, (_, idx) => {
    const day = new Date(monthGridStart);
    day.setDate(monthGridStart.getDate() + idx);
    return day;
  });

  const todayIso = today.toISOString().slice(0, 10);
  const eventsByDate = state.events.reduce<Record<string, typeof state.events>>((acc, event) => {
    acc[event.date] = acc[event.date] ? [...acc[event.date], event] : [event];
    return acc;
  }, {});

  const layoutModules = state.layout.modules;
  const orderedModules = ([
    { key: "calendar", enabled: state.modules.calendar },
    { key: "photos", enabled: state.modules.photos },
    { key: "note", enabled: Boolean(state.note) }
  ] as const)
    .map((module) => ({ ...module, layout: layoutModules[module.key] }))
    .filter((module) => module.enabled)
    .sort((a, b) => a.layout.order - b.layout.order);

  const columnStart = {
    left: "col-start-1",
    center: "col-start-2",
    right: "col-start-3"
  } as const;

  const spanClass = {
    1: "col-span-1",
    2: "col-span-2",
    3: "col-span-3"
  } as const;

  const getLayoutClass = (layout: typeof layoutModules.calendar) => {
    if (layout.span === 3) return "col-span-3";
    if (layout.span === 2) {
      return layout.column === "right" ? "col-span-2 col-start-2" : `col-span-2 ${columnStart[layout.column]}`;
    }
    return `${spanClass[layout.span]} ${columnStart[layout.column]}`;
  };

  return (
    <div className="min-h-screen hearth-bg p-12 text-text">
      <div className="mx-auto flex min-h-[calc(100vh-96px)] max-w-6xl flex-col gap-8">
        <header className="flex items-center justify-between gap-6">
          <div>
            <div className="text-6xl font-semibold">{formatTime(now)}</div>
            <div className="mt-2 text-xl text-muted">{formatDate(now)}</div>
          </div>
          <div className="flex items-stretch gap-4">
            {state.modules.weather || state.weatherForecastEnabled ? (
              <div className="flex items-stretch gap-4">
                {state.modules.weather ? (
                  <div className="rounded-2xl border border-border bg-surface2 px-5 py-3 text-right">
                    <div className="text-3xl font-semibold">{state.weather.temp}</div>
                    <div className="mt-2 flex items-center justify-end">
                      <i
                        className={`wi ${iconClassForCode(state.weather.code)} text-2xl text-accent`}
                        title={state.weather.summary}
                      />
                      <span className="sr-only">{state.weather.summary}</span>
                    </div>
                    <div className="mt-2 text-xs text-faint">{state.weather.location}</div>
                  </div>
                ) : null}
                {state.weatherForecastEnabled ? (
                  <div className="rounded-2xl border border-border bg-surface2 px-5 py-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-faint">5-Day</div>
                    <div className="mt-3 flex items-center gap-4 text-xs text-muted">
                      {state.forecast.length ? (
                        state.forecast.map((day) => (
                          <div key={day.date} className="flex flex-col items-start gap-1">
                            <div className="text-text">
                              {new Date(day.date).toLocaleDateString([], { weekday: "short" })}
                            </div>
                            <i className={`wi ${iconClassForCode(day.code)} text-lg text-accent`} title={day.summary} />
                            <div className="text-text">{day.high}/{day.low}</div>
                          </div>
                        ))
                      ) : (
                        <div className="text-faint">No forecast</div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            {state.qrEnabled && controlQr ? (
              <div className="ml-4 flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-surface2 px-4 py-3 text-center self-stretch">
                <img src={controlQr} alt="QR code for control" className="h-16 w-16 rounded-lg" />
                {pairingCode ? <div className="text-xs text-muted">Code {pairingCode}</div> : null}
              </div>
            ) : state.qrEnabled ? (
              <div className="ml-4 flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-surface2 px-4 py-3 text-center self-stretch">
                <div className="h-16 w-16 rounded-lg border border-dashed border-border bg-surface" />
                <div className="text-xs text-faint">
                  QR {qrStatus}
                  {pairingCode ? ` · Code ${pairingCode}` : ""}
                </div>
              </div>
            ) : null}
          </div>
        </header>

        <div className="grid flex-1 grid-cols-3 gap-6">
          {orderedModules.map((module) => {
            if (module.key === "calendar") {
              return (
                <Card key="calendar" className={getLayoutClass(module.layout)}>
                  <SectionHeader title={today.toLocaleDateString([], { month: "long", year: "numeric" })} />
                  {state.calendarView === "week" ? (
                    <div className="mt-6 grid grid-cols-7 gap-3 text-sm">
                      {weekDays.map((day) => {
                        const iso = day.toISOString().slice(0, 10);
                        const isToday = iso === todayIso;
                        const events = eventsByDate[iso] ?? [];
                        return (
                          <div
                            key={iso}
                            className={[
                              "rounded-2xl border p-3",
                              isToday ? "border-accent bg-[color:var(--calendar-today)]" : "border-border bg-[color:var(--calendar-day)]"
                            ].join(" ")}
                          >
                            <div className="text-xs uppercase tracking-[0.2em] text-faint">
                              {day.toLocaleDateString([], { weekday: "short" })}
                            </div>
                            <div className={["mt-1 text-lg font-semibold", isToday ? "text-accent" : ""].join(" ")}>
                              {day.getDate()}
                            </div>
                            <div className="mt-3 space-y-2 text-base text-muted">
                              {events.length ? (
                                events.map((event) => (
                                  <div
                                    key={event.id}
                                    className={[
                                      "rounded-lg px-2 py-1",
                                      event.allDay ? "bg-accent text-slate-900" : "bg-surface text-text"
                                    ].join(" ")}
                                  >
                                    <EventTitle title={event.title} />
                                  </div>
                                ))
                              ) : (
                                <div className="text-faint">—</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-6 grid grid-cols-7 gap-2 text-xs">
                      {monthDays.map((day) => {
                        const iso = day.toISOString().slice(0, 10);
                        const events = eventsByDate[iso] ?? [];
                        const isCurrentMonth = day.getMonth() === today.getMonth();
                        const isToday = iso === todayIso;
                        return (
                          <div
                            key={iso}
                            className={[
                              "rounded-xl border p-2 min-h-[120px]",
                              isToday ? "border-accent bg-[color:var(--calendar-today)]" : "border-border bg-[color:var(--calendar-day)]",
                              isCurrentMonth ? "" : "bg-[color:var(--calendar-day-muted)] opacity-80"
                            ].join(" ")}
                          >
                            <div className={["text-xs font-semibold", isToday ? "text-accent" : ""].join(" ")}>
                              {day.getDate()}
                            </div>
                            <div className="mt-2 space-y-1 text-base text-muted">
                              {events.map((event) => (
                                <div
                                  key={event.id}
                                  className={[
                                    "rounded px-1 py-0.5",
                                    event.allDay ? "bg-accent text-slate-900" : "bg-surface text-text"
                                  ].join(" ")}
                                >
                                  <EventTitle title={event.title} />
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              );
            }

            if (module.key === "note") {
              return (
                <Card key="note" className={getLayoutClass(module.layout)}>
                  <SectionHeader title={state.noteTitle || "Family Note"} />
                  <div
                    className="hearth-note mt-4 text-lg text-muted"
                    dangerouslySetInnerHTML={{ __html: state.note }}
                  />
                </Card>
              );
            }

            if (module.key === "photos") {
              return (
                <Card key="photos" className={[getLayoutClass(module.layout), "relative overflow-hidden"].join(" ")}>
                  <SectionHeader title="Photos" />
                  <div className="relative mt-6 h-64 w-full overflow-hidden rounded-2xl">
                    {mergedPhotos.map((photo, idx) => (
                      <img
                        key={photo}
                        src={resolvePhotoUrl(photo)}
                        alt="Family memory"
                        className={[
                          "absolute inset-0 h-full w-full object-cover transition-opacity duration-[12000ms]",
                          idx === photoIndex ? "opacity-100" : "opacity-0"
                        ].join(" ")}
                        style={state.photoFocus === "none" ? undefined : { objectPosition: focusMap[state.photoFocus] }}
                      />
                    ))}
                  </div>
                </Card>
              );
            }

            return null;
          })}
        </div>
      </div>
    </div>
  );
}
