import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { HearthState, PublicStateResponse } from "@hearth/shared";
import { Button, Card, SectionHeader } from "@hearth/ui";
import { subscribeToState } from "./sse";

const fallbackState: HearthState = {
  theme: "dark",
  modules: { calendar: true, photos: true, weather: true },
  calendarView: "week",
  calendarTimeFormat: "12h",
  tempUnit: "f",
  weatherForecastEnabled: false,
  qrEnabled: true,
  noteEnabled: true,
  noteTitle: "Family Note",
  note: "",
  events: [],
  photos: [],
  photosGoogle: [],
  photosLocal: [],
  photoSources: { google: true, local: true },
  photoShuffle: true,
  photoFocus: "center",
  photoTiles: 1,
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

function toLocalIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
    "cardOpacity",
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
      const cssKey = key === "surface2" ? "surface-2" : key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
      const value = customTheme[key];
      root.style.setProperty(`--${cssKey}`, typeof value === "number" ? String(value) : value);
    });
  } else {
    keys.forEach((key) => {
      const cssKey = key === "surface2" ? "surface-2" : key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
      root.style.removeProperty(`--${cssKey}`);
    });
  }
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
}

function EventTitle({ title }: { title: string }) {
  return <div className="hearth-wrap">{title}</div>;
}

function EventList({
  className,
  listClassName,
  children
}: {
  className?: string;
  listClassName?: string;
  children: ReactNode;
}) {
  const [shouldScroll, setShouldScroll] = useState(false);
  const [scrollDuration, setScrollDuration] = useState(8);
  const [scrollDistance, setScrollDistance] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;
    const check = () => {
      const overflow = content.scrollHeight > container.clientHeight + 1;
      setShouldScroll(overflow);
      if (overflow) {
        const distance = Math.max(0, content.scrollHeight);
        const duration = Math.max(8, Math.round(distance / 10));
        setScrollDuration(duration);
        setScrollDistance(distance);
      }
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(container);
    observer.observe(content);
    return () => observer.disconnect();
  }, [children]);

  const list = (
    <div ref={contentRef} className={listClassName}>
      {children}
    </div>
  );

  return (
    <div ref={containerRef} className={["hearth-event-list", className].filter(Boolean).join(" ")}>
      {shouldScroll ? (
        <div className="hearth-scroll-wrap">
          <div
            className="hearth-scroll-vertical"
            style={{
              animationDuration: `${scrollDuration}s`,
              ["--scroll-distance" as string]: `${scrollDistance}px`
            }}
          >
            {list}
            <div className={listClassName}>{children}</div>
          </div>
        </div>
      ) : (
        list
      )}
    </div>
  );
}

export function App() {
  const [now, setNow] = useState(() => new Date());
  const [state, setState] = useState<HearthState>(fallbackState);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoIndices, setPhotoIndices] = useState<number[]>([]);
  const [controlQr, setControlQr] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<string>("loading");
  const [lanIp, setLanIp] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairInput, setPairInput] = useState("");
  const [pairError, setPairError] = useState<string | null>(null);
  const [pairedDeviceId, setPairedDeviceId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem("hearthDisplayDeviceId");
  });

  const displayOrigin = useMemo(() => {
    const host = lanIp || window.location.hostname;
    const port = window.location.port;
    return `${window.location.protocol}//${host}${port ? `:${port}` : ""}`;
  }, [lanIp]);

  const deviceIdFromUrl = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("device");
  }, []);
  const displayDeviceId = deviceIdFromUrl ?? pairedDeviceId;

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
        if (!deviceIdFromUrl && pairedDeviceId && pairedDeviceId !== data.deviceId) {
          window.localStorage.removeItem("hearthDisplayDeviceId");
          setPairedDeviceId(null);
          setError("Stored display pairing no longer matches this server.");
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
    if (!displayDeviceId) return;
    if (error) return;

    const unsubscribe = subscribeToState(
      displayDeviceId,
      (next) => {
        setState(next);
        applyTheme(next.theme, next.customTheme);
      },
      () => {
        window.location.reload();
      }
    );

    return () => {
      unsubscribe();
    };
  }, [displayDeviceId, error]);

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

  const photoTileCount = Math.min(Math.max(state.photoTiles ?? 1, 1), 4);

  useEffect(() => {
    if (!photoTileCount) {
      setPhotoIndices([]);
      return;
    }
    if (!mergedPhotos.length) {
      setPhotoIndices(Array.from({ length: photoTileCount }, () => 0));
      return;
    }
    const step = Math.max(1, Math.floor(mergedPhotos.length / photoTileCount));
    setPhotoIndices(Array.from({ length: photoTileCount }, (_, idx) => (idx * step) % mergedPhotos.length));
  }, [mergedPhotos, photoTileCount]);

  useEffect(() => {
    if (!mergedPhotos.length || !photoTileCount) return;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const schedule = (tileIndex: number) => {
      const delay = 8000 + Math.random() * 6000;
      const timer = setTimeout(() => {
        setPhotoIndices((prev) => {
          if (!mergedPhotos.length) return prev;
          const next = [...prev];
          const current = next[tileIndex] ?? 0;
          next[tileIndex] = (current + 1) % mergedPhotos.length;
          return next;
        });
        schedule(tileIndex);
      }, delay);
      timers.push(timer);
    };
    for (let i = 0; i < photoTileCount; i += 1) {
      schedule(i);
    }
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [mergedPhotos, photoTileCount]);

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
  const handlePairSubmit = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!pairingCode) {
      setPairError("Pairing code not available yet.");
      return;
    }
    if (!deviceId) {
      setPairError("Waiting for server to provide a device ID.");
      return;
    }
    if (pairInput.trim() !== pairingCode) {
      setPairError("Code does not match.");
      return;
    }
    setPairError(null);
    setPairedDeviceId(deviceId);
    window.localStorage.setItem("hearthDisplayDeviceId", deviceId);
  };

  if (!displayDeviceId) {
    return (
      <div className="min-h-screen hearth-bg p-6 text-text">
        <div className="mx-auto max-w-2xl">
          <Card>
            <SectionHeader title="Hearth Display" />
            <div className="mt-6 text-lg">Enter the server code to join this display:</div>
            <form className="mt-4 flex flex-wrap items-center gap-3" onSubmit={handlePairSubmit}>
              <input
                className="w-40 rounded-xl border border-border bg-surface2 px-4 py-3 text-lg text-text"
                placeholder="Code"
                value={pairInput}
                onChange={(event) => {
                  setPairInput(event.target.value.toUpperCase());
                  setPairError(null);
                }}
              />
              <Button type="submit" variant="primary" disabled={!pairInput.trim()}>
                Join
              </Button>
            </form>
            {pairError ? <div className="mt-3 text-sm text-rose-300">{pairError}</div> : null}
            <div className="mt-6 text-sm text-muted">
              Get the code from the Hearth control page or the server logs.
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen hearth-bg p-6 text-text">
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

  const todayIso = toLocalIsoDate(today);
  const eventsByDate = state.events.reduce<Record<string, typeof state.events>>((acc, event) => {
    acc[event.date] = acc[event.date] ? [...acc[event.date], event] : [event];
    return acc;
  }, {});

  const layoutModules = state.layout.modules;
  const orderedModules = ([
    { key: "calendar", enabled: state.modules.calendar },
    { key: "photos", enabled: state.modules.photos },
    { key: "note", enabled: state.noteEnabled && Boolean(state.note) }
  ] as const)
    .map((module) => ({ ...module, layout: layoutModules[module.key] }))
    .filter((module) => module.enabled)
    .sort((a, b) => a.layout.order - b.layout.order);

  const columnStart = {
    left: 1,
    center: 2,
    "center-left": 2,
    "center-right": 3,
    right: 4
  } as const;

  const getLayoutStyle = (layout: typeof layoutModules.calendar) => {
    const span = Math.min(Math.max(layout.span, 1), 4);
    const maxStart = 5 - span;
    const desired = columnStart[layout.column] ?? 1;
    const start = Math.min(desired, maxStart);
    return {
      gridColumn: `${start} / span ${span}`,
      height: layout.height ? `${layout.height}px` : undefined
    };
  };

  return (
    <div className="min-h-screen hearth-bg p-6 text-text">
      <div className="mx-auto flex min-h-[calc(100vh-96px)] max-w-6xl flex-col gap-8">
        <header className="flex items-center justify-between gap-6">
          <div className="flex flex-col justify-center rounded-2xl border border-border bg-surface2 px-6 py-4">
            <div className="text-[clamp(2.5rem,6vw,3.5rem)] font-semibold whitespace-nowrap">
              {formatTime(now)}
            </div>
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
              <div className="ml-2 flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-surface2 px-4 py-3 text-center self-stretch">
                <img src={controlQr} alt="QR code for control" className="h-16 w-16 rounded-lg" />
                {pairingCode ? <div className="text-xs text-muted">Code {pairingCode}</div> : null}
              </div>
            ) : state.qrEnabled ? (
              <div className="ml-2 flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-surface2 px-4 py-3 text-center self-stretch">
                <div className="h-16 w-16 rounded-lg border border-dashed border-border bg-surface" />
                <div className="text-xs text-faint">
                  QR {qrStatus}
                  {pairingCode ? ` · Code ${pairingCode}` : ""}
                </div>
              </div>
            ) : null}
          </div>
        </header>

        <div className="grid flex-1 grid-cols-4 gap-6">
          {orderedModules.map((module) => {
            if (module.key === "calendar") {
              return (
                <Card key="calendar" className="flex flex-col overflow-hidden" style={getLayoutStyle(module.layout)}>
                  <SectionHeader title={today.toLocaleDateString([], { month: "long", year: "numeric" })} />
                  {state.calendarView === "week" ? (
                    <div className="mt-6 flex-1 min-h-0 overflow-auto">
                      <div className="grid grid-cols-7 gap-px rounded-2xl bg-border p-px text-sm overflow-hidden">
                        {weekDays.map((day) => {
                          const iso = toLocalIsoDate(day);
                          const isToday = iso === todayIso;
                          const events = eventsByDate[iso] ?? [];
                          return (
                            <div
                              key={iso}
                              className={[
                                "p-3",
                                isToday
                                  ? "bg-[color:var(--calendar-today)] ring-2 ring-inset ring-accent"
                                  : "bg-[color:var(--calendar-day)]"
                              ].join(" ")}
                            >
                              <div className="text-xs uppercase tracking-[0.2em] text-faint">
                                {day.toLocaleDateString([], { weekday: "short" })}
                              </div>
                              <div className={["mt-1 text-lg font-semibold", isToday ? "text-accent" : ""].join(" ")}>
                                {day.getDate()}
                              </div>
                              <EventList className="mt-3 max-h-[7.5rem] overflow-hidden text-xs text-muted" listClassName="space-y-2">
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
                              </EventList>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-6 flex-1 min-h-0 overflow-auto">
                      <div className="grid grid-cols-7 gap-px rounded-xl bg-border p-px text-xs overflow-hidden">
                        {monthDays.map((day) => {
                          const iso = toLocalIsoDate(day);
                          const events = eventsByDate[iso] ?? [];
                          const isCurrentMonth = day.getMonth() === today.getMonth();
                          const isToday = iso === todayIso;
                          const baseBg = isCurrentMonth
                            ? "bg-[color:var(--calendar-day)]"
                            : "bg-[color:var(--calendar-day-muted)] opacity-80";
                          return (
                            <div
                              key={iso}
                              className={[
                                "p-2 min-h-[120px]",
                                isToday ? "bg-[color:var(--calendar-today)] ring-2 ring-inset ring-accent" : baseBg
                              ].join(" ")}
                            >
                              <div className={["text-xs font-semibold", isToday ? "text-accent" : ""].join(" ")}>
                                {day.getDate()}
                              </div>
                              <EventList className="mt-2 max-h-[6rem] overflow-hidden text-xs text-muted" listClassName="space-y-1">
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
                              </EventList>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </Card>
              );
            }

            if (module.key === "note") {
              return (
                <Card key="note" className="" style={getLayoutStyle(module.layout)}>
                  {state.noteTitle ? <SectionHeader title={state.noteTitle} /> : null}
                  <div
                    className="hearth-note mt-4 text-lg text-muted"
                    dangerouslySetInnerHTML={{ __html: state.note }}
                  />
                </Card>
              );
            }

            if (module.key === "photos") {
              const tileCount = photoTileCount;
              const gridStyle = { gridTemplateColumns: `repeat(${tileCount}, minmax(0, 1fr))` };
              return (
                <Card key="photos" className="relative flex flex-col overflow-hidden !p-0 !md:p-0" style={getLayoutStyle(module.layout)}>
                  <div className="grid h-full w-full flex-1 gap-2" style={gridStyle}>
                    {Array.from({ length: tileCount }, (_, tileIndex) => {
                      const activeIndex = photoIndices[tileIndex] ?? 0;
                      return (
                        <div key={tileIndex} className="relative overflow-hidden bg-surface min-h-[16rem]">
                          {mergedPhotos.map((photo, idx) => (
                            <img
                              key={`${tileIndex}-${photo}`}
                              src={resolvePhotoUrl(photo)}
                              alt="Family memory"
                              className={[
                                "absolute inset-0 h-full w-full object-cover transition-opacity duration-[12000ms]",
                                idx === activeIndex ? "opacity-100" : "opacity-0"
                              ].join(" ")}
                              style={state.photoFocus === "none" ? undefined : { objectPosition: focusMap[state.photoFocus] }}
                            />
                          ))}
                        </div>
                      );
                    })}
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
