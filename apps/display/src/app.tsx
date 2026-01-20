import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { HearthState, PublicStateResponse, Popup } from "@hearth/shared";
import { Button, Card, SectionHeader } from "@hearth/ui";
import { subscribeToState } from "./sse";
import { marked } from "marked";

marked.setOptions({ breaks: true });

const fallbackState: HearthState = {
  theme: "dark",
  modules: { calendar: true, photos: true, weather: true },
  calendarView: "week",
  calendarTimeFormat: "12h",
  calendarNote: "",
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

function parseLocalDateString(value: string) {
  if (value.includes("T")) {
    return new Date(value);
  }
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function parseTimeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map((part) => Number.parseInt(part, 10));
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function isOffScheduleActive(schedule: HearthState["offSchedule"] | undefined, now: Date) {
  if (!schedule?.enabled) return false;
  const start = parseTimeToMinutes(schedule.start);
  const end = parseTimeToMinutes(schedule.end);
  if (start === null || end === null) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  if (start === end) return true;
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

function iconAssetForCode(code: number) {
  if (code === 0) return "clear_day.svg";
  if (code === 1) return "mostly_clear_day.svg";
  if (code === 2) return "partly_cloudy_day.svg";
  if (code === 3) return "mostly_cloudy.svg";
  if (code === 45 || code === 48) return "fog.svg";
  if (code >= 51 && code <= 55) return "drizzle.svg";
  if (code >= 56 && code <= 57) return "freezing_drizzle.svg";
  if (code === 61) return "rain_light.svg";
  if (code === 63) return "rain.svg";
  if (code === 65) return "rain_heavy.svg";
  if (code === 66) return "freezing_rain_light.svg";
  if (code === 67) return "freezing_rain_heavy.svg";
  if (code === 71) return "snow_light.svg";
  if (code === 73) return "snow.svg";
  if (code === 75) return "snow_heavy.svg";
  if (code === 77) return "ice_pellets.svg";
  if (code === 80) return "rain_light.svg";
  if (code === 81) return "rain.svg";
  if (code === 82) return "rain_heavy.svg";
  if (code === 85) return "snow_light.svg";
  if (code === 86) return "snow_heavy.svg";
  if (code >= 95) return "tstorm.svg";
  return "cloudy.svg";
}

function weatherIconSrc(code: number) {
  return `${import.meta.env.BASE_URL}weather-icons/${iconAssetForCode(code)}`;
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
  const [popups, setPopups] = useState<Popup[]>([]);
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

    fetch("/api/popups")
      .then(async (res) => {
        if (!res.ok) return { popups: [] };
        return (await res.json()) as { popups: Popup[] };
      })
      .then((data) => {
        if (!active) return;
        console.info("Initial popups loaded", data.popups);
        setPopups(data.popups ?? []);
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
      },
      (payload) => {
        console.info("Popup event received", payload);
        if (payload.action === "clear") {
          setPopups([]);
          return;
        }
        if (payload.action === "upsert" && payload.popup) {
          const popup = payload.popup as Popup;
          setPopups((prev) => {
            const index = prev.findIndex((item) => item.id === popup.id);
            if (index === -1) return [...prev, popup];
            const next = [...prev];
            next[index] = popup;
            return next;
          });
        }
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
  const photoTransitionMs = Math.min(Math.max(state.photoTransitionMs ?? 12000, 4000), 60000);
  const photoFadeMs = Math.min(4000, Math.max(800, Math.round(photoTransitionMs * 0.35)));

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
      const jitter = photoTransitionMs * 0.3;
      const delay = Math.max(1500, photoTransitionMs - jitter + Math.random() * jitter * 2);
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
  }, [mergedPhotos, photoTileCount, photoTransitionMs]);

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

  useEffect(() => {
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const nowMs = Date.now();
    popups.forEach((popup) => {
      if (!popup.visible || !popup.expiresAt) return;
      const expiresAt = new Date(popup.expiresAt).getTime();
      if (Number.isNaN(expiresAt) || expiresAt <= nowMs) return;
      const timer = setTimeout(() => {
        setPopups((prev) =>
          prev.map((item) => (item.id === popup.id ? { ...item, visible: false } : item))
        );
      }, expiresAt - nowMs);
      timers.push(timer);
    });
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [popups]);

  const offActive = isOffScheduleActive(state.offSchedule, now);

  useEffect(() => {
    const root = document.documentElement;
    if (offActive) {
      root.dataset.off = "true";
      document.body.dataset.off = "true";
    } else {
      delete root.dataset.off;
      delete document.body.dataset.off;
    }
  }, [offActive]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    if (offActive) {
      root.style.backgroundColor = "#000";
      body.style.backgroundColor = "#000";
      body.style.backgroundImage = "none";
    } else {
      root.style.removeProperty("background-color");
      body.style.removeProperty("background-color");
      body.style.removeProperty("background-image");
    }
  }, [offActive]);

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

  const activePopups = useMemo(() => {
    const nowMs = now.getTime();
    return popups.filter((popup) => {
      if (!popup.visible) return false;
      if (!popup.expiresAt) return true;
      const expiresAt = new Date(popup.expiresAt).getTime();
      return Number.isNaN(expiresAt) ? true : expiresAt > nowMs;
    });
  }, [now, popups]);

  const popupGroups = useMemo(() => {
    return activePopups.reduce<Record<Popup["position"], Popup[]>>(
      (acc, popup) => {
        acc[popup.position] = acc[popup.position] ? [...acc[popup.position], popup] : [popup];
        return acc;
      },
      {
        "top-left": [],
        "top-middle": [],
        "top-right": [],
        "middle-left": [],
        middle: [],
        "middle-right": [],
        "bottom-left": [],
        "bottom-middle": [],
        "bottom-right": []
      }
    );
  }, [activePopups]);

  const popupPositions: Array<Popup["position"]> = [
    "top-left",
    "top-middle",
    "top-right",
    "middle-left",
    "middle",
    "middle-right",
    "bottom-left",
    "bottom-middle",
    "bottom-right"
  ];

  const popupClasses: Record<Popup["position"], string> = {
    "top-left": "top-6 left-6 items-start",
    "top-middle": "top-6 left-1/2 -translate-x-1/2 items-center",
    "top-right": "top-6 right-6 items-end",
    "middle-left": "top-1/2 left-6 -translate-y-1/2 items-start",
    middle: "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 items-center",
    "middle-right": "top-1/2 right-6 -translate-y-1/2 items-end",
    "bottom-left": "bottom-6 left-6 items-start",
    "bottom-middle": "bottom-6 left-1/2 -translate-x-1/2 items-center",
    "bottom-right": "bottom-6 right-6 items-end"
  };

  const popupPriorityColors: Record<Popup["priority"], string> = {
    success: "var(--accent)",
    warning: "#f59e0b",
    emergency: "#ef4444",
    plain: "var(--text)"
  };

  const renderPopupIcon = (priority: Popup["priority"]) => {
    if (priority === "plain") {
      return null;
    }
    if (priority === "success") {
      return (
        <svg viewBox="0 0 24 24" className="hearth-popup-icon" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 2.5c5.25 0 9.5 4.25 9.5 9.5s-4.25 9.5-9.5 9.5S2.5 17.25 2.5 12 6.75 2.5 12 2.5zm4.02 6.85-4.69 4.7-2.36-2.37a.9.9 0 1 0-1.27 1.27l3 3a.9.9 0 0 0 1.27 0l5.33-5.33a.9.9 0 1 0-1.28-1.27z"
          />
        </svg>
      );
    }
    if (priority === "warning") {
      return (
        <svg viewBox="0 0 24 24" className="hearth-popup-icon" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 3.2c.4 0 .76.21.95.55l8.02 14.35a1.1 1.1 0 0 1-.95 1.65H3.98a1.1 1.1 0 0 1-.95-1.65L11.05 3.75c.19-.34.55-.55.95-.55zm0 5.3a.9.9 0 0 0-.9.9v4.2a.9.9 0 0 0 1.8 0V9.4a.9.9 0 0 0-.9-.9zm0 8.1a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2z"
          />
        </svg>
      );
    }
    return (
      <svg viewBox="0 0 24 24" className="hearth-popup-icon" aria-hidden="true">
        <path
          fill="currentColor"
          d="M8.6 2.5h6.8c.47 0 .9.2 1.2.53l4.87 5.3c.32.34.5.8.5 1.27v6.75c0 1.1-.9 2-2 2H4.03c-1.1 0-2-.9-2-2V9.65c0-.47.18-.93.5-1.27l4.87-5.3c.3-.33.73-.53 1.2-.53zm3.4 6.15a.9.9 0 0 0-.9.9v4.2a.9.9 0 0 0 1.8 0v-4.2a.9.9 0 0 0-.9-.9zm0 7.95a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2z"
        />
      </svg>
    );
  };

  if (offActive) {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: "100vw",
          height: "100vh",
          backgroundColor: "#000"
        }}
      />
    );
  }

  return (
    <div className="min-h-screen hearth-bg p-6 text-text">
      <div className="mx-auto flex min-h-[calc(100vh-96px)] max-w-6xl flex-col gap-8">
        <header className="flex items-stretch justify-between gap-6">
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
                  <div className="flex flex-col justify-center rounded-2xl border border-border bg-surface2 px-6 py-4 text-right">
                    <div className="text-3xl font-semibold">{state.weather.temp}</div>
                    <div className="mt-2 flex items-center justify-end">
                      <img
                        src={weatherIconSrc(state.weather.code)}
                        alt={state.weather.summary}
                        title={state.weather.summary}
                        className="h-8 w-8"
                      />
                      <span className="sr-only">{state.weather.summary}</span>
                    </div>
                    <div className="mt-2 text-xs text-faint">{state.weather.location}</div>
                  </div>
                ) : null}
                {state.weatherForecastEnabled ? (
                  <div className="flex flex-col justify-center rounded-2xl border border-border bg-surface2 px-6 py-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-faint">5-Day</div>
                    <div className="mt-3 flex items-center gap-5 text-sm text-muted">
                      {state.forecast.length ? (
                        state.forecast.map((day) => (
                          <div key={day.date} className="flex flex-col items-start gap-2">
                            <div className="text-base font-semibold text-text">
                              {parseLocalDateString(day.date).toLocaleDateString([], { weekday: "short" })}
                            </div>
                            <img
                              src={weatherIconSrc(day.code)}
                              alt={day.summary}
                              title={day.summary}
                              className="h-8 w-8"
                            />
                            <div className="text-sm font-semibold text-text">{day.high}/{day.low}</div>
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
          </div>
        </header>

        <div className="grid flex-1 grid-cols-4 gap-6">
          {orderedModules.map((module) => {
            if (module.key === "calendar") {
              return (
                <Card key="calendar" className="flex flex-col overflow-hidden" style={getLayoutStyle(module.layout)}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <SectionHeader title={today.toLocaleDateString([], { month: "long", year: "numeric" })} />
                    {state.calendarNote.trim() ? (
                      <div className="rounded-xl border border-border bg-surface2 px-4 py-2 text-sm text-text opacity-90 shadow-[0_6px_16px_rgba(0,0,0,0.12)]">
                        {state.calendarNote}
                      </div>
                    ) : null}
                  </div>
                  {state.calendarView === "week" ? (
                    <div className="mt-6 flex-1 min-h-0 overflow-hidden">
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
                    <div className="mt-6 flex-1 min-h-0 overflow-hidden">
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
                                "absolute inset-0 h-full w-full object-cover transition-opacity",
                                idx === activeIndex ? "opacity-100" : "opacity-0"
                              ].join(" ")}
                              style={{
                                transitionDuration: `${photoFadeMs}ms`,
                                ...(state.photoFocus === "none" ? {} : { objectPosition: focusMap[state.photoFocus] })
                              }}
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
      {state.qrEnabled && controlQr ? (
        <div className="fixed bottom-4 right-4 z-30 flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-surface2 px-3 py-3 text-center">
          <img src={controlQr} alt="QR code for control" className="h-16 w-16 rounded-lg" />
          {pairingCode ? <div className="text-[11px] text-muted">Code {pairingCode}</div> : null}
        </div>
      ) : state.qrEnabled ? (
        <div className="fixed bottom-4 right-4 z-30 flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-surface2 px-3 py-3 text-center">
          <div className="h-16 w-16 rounded-lg border border-dashed border-border bg-surface" />
          <div className="text-[11px] text-faint">
            QR {qrStatus}
            {pairingCode ? ` · Code ${pairingCode}` : ""}
          </div>
        </div>
      ) : null}
      {popupPositions.map((position) => {
        const items = popupGroups[position];
        if (!items?.length) return null;
        return (
          <div
            key={position}
            className={[
              "pointer-events-none fixed z-40 flex max-w-sm flex-col gap-3",
              popupClasses[position]
            ].join(" ")}
          >
            {items.map((popup) => (
              <div
                key={popup.id}
                className="hearth-popup rounded-2xl border border-border px-5 py-4 shadow-[0_10px_30px_rgba(0,0,0,0.18)] backdrop-blur"
              >
                <div className="flex items-start gap-3">
                  {renderPopupIcon(popup.priority) ? (
                    <div className="mt-0.5" style={{ color: popupPriorityColors[popup.priority] }}>
                      {renderPopupIcon(popup.priority)}
                    </div>
                  ) : null}
                  <div
                    className="min-w-0"
                    dangerouslySetInnerHTML={{ __html: marked.parse(popup.message) }}
                  />
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
