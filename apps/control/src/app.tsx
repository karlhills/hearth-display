import { useEffect, useMemo, useRef, useState } from "react";
import type { CalendarEvent, HearthState, Theme } from "@hearth/shared";
import { Button, Card, SectionHeader, Toggle } from "@hearth/ui";
import { clearStoredToken, clearThemeBackground, completePickerSession, createPickerSession, disconnectGooglePhotos, fetchCalendarSettings, fetchGooglePhotosStatus, fetchLocalPhotosSettings, fetchPairingCode, fetchPickerSession, fetchState, fetchWeatherSettings, getStoredToken, pair, scanLocalPhotos, toggleModule, updateCalendarSettings, updateLocalPhotosSettings, updateState, updateWeatherSettings, uploadThemeBackground } from "./api";

const emptyState: HearthState = {
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

function createBlankEvent(): CalendarEvent {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    id,
    title: "",
    date: new Date().toISOString().slice(0, 10),
    allDay: true,
    source: "manual"
  };
}

const initialToken = (() => {
  if (typeof window === "undefined") return getStoredToken();
  const params = new URLSearchParams(window.location.search);
  const returnedToken = params.get("token");
  if (returnedToken) {
    localStorage.setItem("hearth-token", returnedToken);
    return returnedToken;
  }
  return getStoredToken();
})();

function applyTheme(theme: Theme, customTheme: HearthState["customTheme"]) {
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

function toHexColor(value: string) {
  const trimmed = value.trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) {
    return trimmed.length === 4
      ? `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`
      : trimmed;
  }
  const rgbMatch = trimmed.match(/rgba?\(([^)]+)\)/i);
  if (!rgbMatch) return "#000000";
  const parts = rgbMatch[1].split(",").map((part) => Number.parseFloat(part.trim()));
  if (parts.length < 3 || parts.some((num) => Number.isNaN(num))) return "#000000";
  const [r, g, b] = parts;
  const toHex = (num: number) => Math.max(0, Math.min(255, Math.round(num))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function clampOpacity(value: number) {
  return Math.min(1, Math.max(0, value));
}

const defaultCustomTheme: HearthState["customTheme"] = {
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
};

const lightCustomTheme: HearthState["customTheme"] = {
  bg: "#F6F7FB",
  surface: "#FFFFFF",
  surface2: "#F1F5F9",
  cardOpacity: 1,
  calendarDay: "#EEF2FF",
  calendarDayMuted: "rgba(238, 242, 255, 0.6)",
  calendarToday: "#FFFFFF",
  border: "rgba(15, 23, 42, 0.1)",
  text: "rgba(15, 23, 42, 0.92)",
  muted: "rgba(15, 23, 42, 0.65)",
  faint: "rgba(15, 23, 42, 0.45)",
  accent: "#2DD4BF",
  buttonText: "rgba(15, 23, 42, 0.92)",
  buttonTextOnAccent: "#0B0F14",
  backgroundImage: "",
  backgroundPosition: "center"
};

export function App() {
  const [state, setState] = useState<HearthState>(emptyState);
  const [token, setToken] = useState(initialToken);
  const [pairCode, setPairCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [noteDraft, setNoteDraft] = useState(emptyState.note);
  const [noteTitleDraft, setNoteTitleDraft] = useState(emptyState.noteTitle);
  const [deviceId, setDeviceId] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);
  const [calendarUrl, setCalendarUrl] = useState("");
  const [calendarSyncing, setCalendarSyncing] = useState(false);
  const [weatherQuery, setWeatherQuery] = useState("");
  const [weatherSyncing, setWeatherSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<"general" | "layout" | "calendar" | "photos" | "weather" | "about">("general");
  const noteRef = useRef<HTMLDivElement | null>(null);
  const [googleStatus, setGoogleStatus] = useState<{ connected: boolean }>({
    connected: false
  });
  const [pickerSessionId, setPickerSessionId] = useState("");
  const [pickerUri, setPickerUri] = useState("");
  const [pickerReady, setPickerReady] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const pickerWindowRef = useRef<Window | null>(null);
  const [pickerAutoSync, setPickerAutoSync] = useState(false);
  const [localPhotosDir, setLocalPhotosDir] = useState("");
  const [localPhotosLoading, setLocalPhotosLoading] = useState(false);
  const layoutDirtyRef = useRef(false);
  const layoutSaveTimer = useRef<number | null>(null);
  const [customThemeOpen, setCustomThemeOpen] = useState(false);
  const [backgroundThemeOpen, setBackgroundThemeOpen] = useState(false);
  const [themeHintOpen, setThemeHintOpen] = useState<string | null>(null);
  const [customDraft, setCustomDraft] = useState<HearthState["customTheme"]>(defaultCustomTheme);

  const displayOrigin = useMemo(() => {
    const host = window.location.hostname;
    const port = window.location.port === "8787" || window.location.port === "" ? window.location.port : "8787";
    return `${window.location.protocol}//${host}${port ? `:${port}` : ""}`;
  }, []);

  const displayUrl = useMemo(() => {
    return deviceId ? `${displayOrigin}/display/?device=${deviceId}` : "";
  }, [deviceId, displayOrigin]);

  const googleAuthUrl = useMemo(() => {
    const authToken = token || getStoredToken();
    const url = new URL(`${displayOrigin}/api/control/photos/google/auth`);
    if (authToken) url.searchParams.set("token", authToken);
    return url.toString();
  }, [displayOrigin, token]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pairFromUrl = params.get("pair");
    if (!token && pairFromUrl) {
      pair(pairFromUrl)
        .then((newToken) => {
          setToken(newToken);
          params.delete("pair");
          const next = params.toString();
          const nextUrl = next ? `${window.location.pathname}?${next}` : window.location.pathname;
          window.history.replaceState({}, "", nextUrl);
        })
        .catch(() => {
          setError("Pairing code not accepted.");
        });
    }
    fetchState()
      .then((data) => {
        setState(data.state);
        setDeviceId(data.deviceId);
        setCustomDraft(data.state.customTheme);
        setNoteDraft(data.state.note);
        setNoteTitleDraft(data.state.noteTitle);
        applyTheme(data.state.theme, data.state.customTheme);
        setError(null);
      })
      .catch((err) => {
        console.error(err);
        setError("Unable to load Hearth state.");
      });

    fetchCalendarSettings()
      .then((data) => setCalendarUrl(data.icsUrl))
      .catch((err) => {
        console.error(err);
      });

    fetchWeatherSettings()
      .then((data) => setWeatherQuery(data.query))
      .catch((err) => {
        console.error(err);
      });

    fetchGooglePhotosStatus()
      .then((data) => setGoogleStatus(data))
      .catch((err) => {
        console.error(err);
      });

    fetchLocalPhotosSettings()
      .then((data) => setLocalPhotosDir(data.directory))
      .catch((err) => {
        console.error(err);
      });

    fetchPairingCode()
      .then((data) => setPairingCode(data.code || null))
      .catch((err) => {
        console.error(err);
      });

    const tokenParams = new URLSearchParams(window.location.search);
    const returnedToken = tokenParams.get("token");
    if (returnedToken) {
      localStorage.setItem("hearth-token", returnedToken);
      setToken(returnedToken);
      tokenParams.delete("token");
      const next = tokenParams.toString();
      const nextUrl = next ? `${window.location.pathname}?${next}` : window.location.pathname;
      window.history.replaceState({}, "", nextUrl);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    applyTheme(state.theme, state.customTheme);
  }, [token, state.theme, state.customTheme]);

  useEffect(() => {
    if (activeTab !== "general") return;
    if (!noteRef.current) return;
    if (noteRef.current.innerHTML !== noteDraft) {
      noteRef.current.innerHTML = noteDraft || "";
    }
  }, [noteDraft, activeTab]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        handleAutoSync();
      }
    };
    const handleFocus = () => {
      handleAutoSync();
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [pickerSessionId, pickerAutoSync, googleLoading]);

  const handlePair = async () => {
    try {
      setSaving(true);
      const newToken = await pair(pairCode.trim());
      setToken(newToken);
      setPairCode("");
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Pairing code not accepted.");
    } finally {
      setSaving(false);
    }
  };

  const handleThemeToggle = async (nextTheme: Theme) => {
    try {
      setSaving(true);
      const updated = await updateState({ theme: nextTheme });
      setState(updated);
      applyTheme(updated.theme, updated.customTheme);
    } catch (err) {
      console.error(err);
      setError("Failed to update theme.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCustomTheme = async () => {
    try {
      setSaving(true);
      const updated = await updateState({ theme: "custom", customTheme: customDraft });
      setState(updated);
      applyTheme(updated.theme, updated.customTheme);
      setCustomThemeOpen(false);
    } catch (err) {
      console.error(err);
      setError("Failed to update custom theme.");
    } finally {
      setSaving(false);
    }
  };

  const handleResetCustomTheme = async () => {
    try {
      setSaving(true);
      const cleared = {
        ...defaultCustomTheme,
        backgroundImage: customDraft.backgroundImage,
        backgroundPosition: customDraft.backgroundPosition
      };
      setCustomDraft(cleared);
      const updated = await updateState({ theme: "custom", customTheme: cleared });
      setState(updated);
      applyTheme(updated.theme, updated.customTheme);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Failed to reset theme.");
    } finally {
      setSaving(false);
    }
  };

  const handleResetLightTheme = async () => {
    try {
      setSaving(true);
      const cleared = {
        ...lightCustomTheme,
        backgroundImage: customDraft.backgroundImage,
        backgroundPosition: customDraft.backgroundPosition
      };
      setCustomDraft(cleared);
      const updated = await updateState({ theme: "custom", customTheme: cleared });
      setState(updated);
      applyTheme(updated.theme, updated.customTheme);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Failed to reset theme.");
    } finally {
      setSaving(false);
    }
  };

  const handleThemeBackgroundUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        setSaving(true);
        const dataUrl = String(reader.result ?? "");
        const result = await uploadThemeBackground(dataUrl);
        const nextTheme = { ...customDraft, backgroundImage: result.url };
        setCustomDraft(nextTheme);
        const updated = await updateState({ customTheme: nextTheme });
        setState(updated);
        applyTheme(updated.theme, updated.customTheme);
        setError(null);
      } catch (err) {
        console.error(err);
        setError("Failed to upload background image.");
      } finally {
        setSaving(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleClearThemeBackground = async () => {
    try {
      setSaving(true);
      const result = await clearThemeBackground();
      const nextTheme = { ...customDraft, backgroundImage: result.url };
      setCustomDraft(nextTheme);
      const updated = await updateState({ customTheme: nextTheme });
      setState(updated);
      applyTheme(updated.theme, updated.customTheme);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Failed to clear background image.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (module: keyof HearthState["modules"], enabled: boolean) => {
    try {
      setSaving(true);
      const updated = await toggleModule(module, enabled);
      setState(updated);
    } catch (err) {
      console.error(err);
      setError("Failed to toggle module.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNote = async () => {
    try {
      setSaving(true);
      const updated = await updateState({ note: noteDraft, noteTitle: noteTitleDraft });
      setState(updated);
      setNoteDraft(updated.note);
      setNoteTitleDraft(updated.noteTitle);
    } catch (err) {
      console.error(err);
      setError("Failed to save note.");
    } finally {
      setSaving(false);
    }
  };

  const handleNoteCommand = (command: "bold" | "underline" | "insertBreak" | "insertTable") => {
    const element = noteRef.current;
    if (!element) return;
    element.focus();
    if (command === "insertBreak") {
      document.execCommand("insertHTML", false, "<br><br>");
      return;
    }
    if (command === "insertTable") {
      const tableHtml = `
        <table>
          <tbody>
            <tr>
              <th>Heading 1</th>
              <th>Heading 2</th>
            </tr>
            <tr>
              <td>Item A</td>
              <td>Item B</td>
            </tr>
          </tbody>
        </table>
      `;
      document.execCommand("insertHTML", false, tableHtml.trim());
      return;
    }
    document.execCommand(command, false);
  };

  const handleSaveEvents = async () => {
    try {
      setSaving(true);
      const updated = await updateState({ events: state.events });
      setState(updated);
    } catch (err) {
      console.error(err);
      setError("Failed to save events.");
    } finally {
      setSaving(false);
    }
  };

  const handleCalendarView = async (view: HearthState["calendarView"]) => {
    try {
      setSaving(true);
      const updated = await updateState({ calendarView: view });
      setState(updated);
    } catch (err) {
      console.error(err);
      setError("Failed to update calendar view.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCalendar = async () => {
    try {
      setCalendarSyncing(true);
      await updateCalendarSettings(calendarUrl.trim(), true);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Failed to save calendar settings.");
    } finally {
      setCalendarSyncing(false);
    }
  };

  const handleSaveWeather = async () => {
    try {
      setWeatherSyncing(true);
      await updateWeatherSettings(weatherQuery.trim(), true);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Failed to save weather settings.");
    } finally {
      setWeatherSyncing(false);
    }
  };

  const normalizeModuleLayout = (layout: HearthState["layout"]["modules"]["calendar"]) => {
    if (layout.span === 3) {
      return { ...layout, column: "left" };
    }
    if (layout.span === 2 && layout.column === "right") {
      return { ...layout, column: "center" };
    }
    return layout;
  };

  const updateModuleLayout = (key: keyof HearthState["layout"]["modules"], partial: Partial<HearthState["layout"]["modules"]["calendar"]>) => {
    const next = normalizeModuleLayout({ ...state.layout.modules[key], ...partial });
    const nextLayout = {
      ...state.layout,
      modules: { ...state.layout.modules, [key]: next }
    };
    layoutDirtyRef.current = true;
    setState({ ...state, layout: nextLayout });
  };

  const moveModule = (key: keyof HearthState["layout"]["modules"], direction: "up" | "down") => {
    const entries = Object.entries(state.layout.modules) as Array<[keyof HearthState["layout"]["modules"], HearthState["layout"]["modules"]["calendar"]]>;
    const ordered = entries.sort((a, b) => a[1].order - b[1].order);
    const index = ordered.findIndex(([name]) => name === key);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= ordered.length) return;
    const [keyA, layoutA] = ordered[index];
    const [keyB, layoutB] = ordered[swapIndex];
    const nextLayout = {
      ...state.layout,
      modules: {
        ...state.layout.modules,
        [keyA]: { ...layoutA, order: layoutB.order },
        [keyB]: { ...layoutB, order: layoutA.order }
      }
    };
    layoutDirtyRef.current = true;
    setState({ ...state, layout: nextLayout });
  };

  useEffect(() => {
    if (!layoutDirtyRef.current) return;
    if (layoutSaveTimer.current) {
      window.clearTimeout(layoutSaveTimer.current);
    }
    layoutSaveTimer.current = window.setTimeout(async () => {
      try {
        setSaving(true);
        const updated = await updateState({ layout: state.layout });
        setState((prev) => ({
          ...prev,
          layout: updated.layout,
          updatedAt: updated.updatedAt
        }));
      } catch (err) {
        console.error(err);
        setError("Failed to save layout.");
      } finally {
        setSaving(false);
        layoutDirtyRef.current = false;
      }
    }, 500);
    return () => {
      if (layoutSaveTimer.current) {
        window.clearTimeout(layoutSaveTimer.current);
      }
    };
  }, [state.layout]);

  const handleChoosePhotos = async () => {
    const popup = window.open("about:blank", "_blank");
    try {
      setGoogleLoading(true);
      const data = await createPickerSession();
      setPickerSessionId(data.sessionId);
      setPickerUri(data.pickerUri);
      setPickerReady(false);
      setPickerAutoSync(true);
      if (data.pickerUri && popup) {
        popup.location.href = data.pickerUri;
      }
      pickerWindowRef.current = popup;
      if (!data.pickerUri) {
        setError("Picker URL missing. Try again.");
        if (popup) {
          popup.close();
        }
        setPickerSessionId("");
        setPickerUri("");
        setPickerReady(false);
        setPickerAutoSync(false);
        return;
      }
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Unable to start the Google Photos picker.");
      if (popup) {
        popup.close();
      }
      setPickerSessionId("");
      setPickerUri("");
      setPickerReady(false);
      setPickerAutoSync(false);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSaveLocalPhotos = async (syncNow: boolean) => {
    const dir = localPhotosDir.trim();
    try {
      setLocalPhotosLoading(true);
      if (!dir) {
        await updateLocalPhotosSettings("");
        const updated = await updateState({
          photosLocal: [],
          photoSources: { ...state.photoSources, local: false }
        });
        setState(updated);
        setError(null);
        return;
      }
      await updateLocalPhotosSettings(dir);
      if (syncNow) {
        await scanLocalPhotos(dir);
      }
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Unable to scan local photos.");
    } finally {
      setLocalPhotosLoading(false);
    }
  };


  const handleAutoSync = async () => {
    if (!pickerSessionId || !pickerAutoSync || googleLoading) return;
    try {
      setGoogleLoading(true);
      const data = await fetchPickerSession(pickerSessionId);
      setPickerReady(data.mediaItemsSet);
      if (data.mediaItemsSet) {
        try {
          await completePickerSession(pickerSessionId);
          setPickerReady(false);
          setPickerAutoSync(false);
        } catch (err) {
          setPickerAutoSync(false);
          throw err;
        }
      }
    } catch (err) {
      console.error(err);
      setError("Unable to sync Google Photos selection.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSyncNow = async () => {
    if (!pickerSessionId) return;
    try {
      setGoogleLoading(true);
      await completePickerSession(pickerSessionId);
      setPickerReady(false);
      setPickerAutoSync(false);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Unable to sync Google Photos selection.");
    } finally {
      setGoogleLoading(false);
    }
  };


  const handleDisconnectGoogle = async () => {
    try {
      setGoogleLoading(true);
      await disconnectGooglePhotos();
      setGoogleStatus({ connected: false });
      setPickerSessionId("");
      setPickerUri("");
      setPickerReady(false);
      setPickerAutoSync(false);
    } catch (err) {
      console.error(err);
      setError("Unable to disconnect Google Photos.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleCopyUrl = async () => {
    if (!deviceId) return;
    try {
      await navigator.clipboard.writeText(displayUrl);
      setError(null);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 1500);
    } catch (err) {
      console.error(err);
      setError("Unable to copy URL.");
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen hearth-bg px-6 py-10 text-text">
        <div className="mx-auto max-w-md">
          <Card>
            <SectionHeader title="Hearth Control" />
            <div className="mt-6 text-lg">Enter the pairing code from the server logs.</div>
            <input
              className="mt-4 w-full rounded-xl border border-border bg-surface2 px-4 py-3 text-lg text-text"
              placeholder="Pairing code"
              value={pairCode}
              onChange={(event) => setPairCode(event.target.value)}
            />
            {error ? <div className="mt-3 text-sm text-rose-300">{error}</div> : null}
            <Button className="mt-6 w-full" onClick={handlePair} disabled={saving || !pairCode.trim()}>
              Pair with Hearth
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen hearth-bg px-6 py-10 text-text">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={`${import.meta.env.BASE_URL}${state.theme === "light" ? "hearth-dark-mark.png" : "hearth-light-mark.png"}`}
              alt="Hearth"
              className="h-10 w-10"
            />
            <div>
              <div className="text-2xl font-semibold">Hearth</div>
              <div className="text-sm text-muted">Control Panel</div>
            </div>
          </div>
          <Button variant="secondary" onClick={() => {
            clearStoredToken();
            setToken(null);
          }}>
            Sign out
          </Button>
        </header>

        {error ? <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

        <Card>
          <div className="flex flex-wrap gap-2">
            {[
              { key: "general", label: "General" },
              { key: "layout", label: "Layout" },
              { key: "calendar", label: "Calendar" },
              { key: "photos", label: "Photos" },
              { key: "weather", label: "Weather" },
              { key: "about", label: "About" }
            ].map((tab) => (
              <Button
                key={tab.key}
                variant={activeTab === tab.key ? "primary" : "secondary"}
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </Card>

        {activeTab === "general" ? (
          <>
            <Card>
              <SectionHeader title="Display" />
              <div className="mt-4 text-sm text-muted">Open this URL on your TV.</div>
              <div className="mt-4 flex items-stretch overflow-hidden rounded-xl border border-border bg-surface2 text-sm">
                <div className="flex-1 px-4 py-3">
                  <span className="block break-all">{displayUrl || "Loading device URL..."}</span>
                </div>
                <Button
                  variant="secondary"
                  className="rounded-none border-0 px-4"
                  onClick={handleCopyUrl}
                >
                  {copySuccess ? "Copied" : "Copy URL"}
                </Button>
              </div>
              <div className="mt-4 rounded-xl border border-border bg-surface2 px-4 py-3 text-sm">
                <div className="text-xs uppercase tracking-[0.2em] text-faint">Display code</div>
                <div className="mt-2 text-lg font-semibold tracking-[0.2em]">
                  {pairingCode ?? "Loading..."}
                </div>
                <div className="mt-1 text-xs text-muted">Enter this on the TV to join.</div>
              </div>
              <div className="mt-4">
                <Toggle
                  checked={state.qrEnabled}
                  label="Show QR code on display"
                  onChange={async (next) => {
                    const updated = await updateState({ qrEnabled: next });
                    setState(updated);
                  }}
                />
              </div>
            </Card>

            <Card>
              <SectionHeader title="Theme" />
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  variant={state.theme === "dark" ? "primary" : "secondary"}
                  onClick={() => handleThemeToggle("dark")}
                  disabled={saving}
                >
                  Dark
                </Button>
                <Button
                  variant={state.theme === "light" ? "primary" : "secondary"}
                  onClick={() => handleThemeToggle("light")}
                  disabled={saving}
                >
                  Light
                </Button>
                <Button
                  variant={state.theme === "custom" ? "primary" : "secondary"}
                  onClick={() => {
                    setCustomDraft(state.customTheme);
                    setCustomThemeOpen(true);
                  }}
                  disabled={saving}
                >
                  Custom
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setCustomDraft(state.customTheme);
                    setBackgroundThemeOpen(true);
                  }}
                  disabled={saving}
                >
                  Background Image
                </Button>
              </div>
            </Card>

            <Card>
              <SectionHeader title="Notes" meta="Shown on display" />
              <input
                className="mt-4 w-full rounded-xl border border-border bg-surface2 px-4 py-3 text-sm text-text"
                placeholder="Note title"
                value={noteTitleDraft}
                onChange={(event) => setNoteTitleDraft(event.target.value)}
              />
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={() => handleNoteCommand("bold")}>
                  Bold
                </Button>
                <Button variant="secondary" onClick={() => handleNoteCommand("underline")}>
                  Underline
                </Button>
                <Button variant="secondary" onClick={() => handleNoteCommand("insertBreak")}>
                  Space
                </Button>
                <Button variant="secondary" onClick={() => handleNoteCommand("insertTable")}>
                  Insert table
                </Button>
              </div>
              <div
                ref={noteRef}
                className="hearth-note-editor mt-4 min-h-[140px] w-full rounded-xl border border-border bg-surface2 px-4 py-3 text-sm text-text focus:outline-none"
                contentEditable
                suppressContentEditableWarning
                onInput={(event) => {
                  const html = (event.currentTarget as HTMLDivElement).innerHTML;
                  setNoteDraft(html);
                }}
              />
              <Button className="mt-4" onClick={handleSaveNote} disabled={saving}>
                Save Note
              </Button>
            </Card>
          </>
        ) : null}

        {activeTab === "calendar" ? (
          <>
            <Card>
              <SectionHeader title="Calendar Module" />
              <div className="mt-4">
                <Toggle
                  checked={state.modules.calendar}
                  label="Enabled"
                  onChange={(next) => handleToggle("calendar", next)}
                />
              </div>
            </Card>

            <Card>
              <SectionHeader title="Calendar View" />
              <div className="mt-4 flex items-center gap-3">
                <Button
                  variant={state.calendarView === "week" ? "primary" : "secondary"}
                  onClick={() => handleCalendarView("week")}
                  disabled={saving}
                >
                  Weekly
                </Button>
                <Button
                  variant={state.calendarView === "month" ? "primary" : "secondary"}
                  onClick={() => handleCalendarView("month")}
                  disabled={saving}
                >
                  Monthly
                </Button>
              </div>
            </Card>

            <Card>
              <SectionHeader title="External Calendar" meta="ICS link" />
              <div className="mt-4 text-sm text-muted">
                Paste a public ICS URL from Google Calendar or Apple iCloud.
              </div>
              <input
                className="mt-4 w-full rounded-xl border border-border bg-surface2 px-4 py-3 text-sm text-text"
                placeholder="https://calendar.google.com/calendar/ical/..."
                value={calendarUrl}
                onChange={(event) => setCalendarUrl(event.target.value)}
              />
              <Button className="mt-4" onClick={handleSaveCalendar} disabled={calendarSyncing}>
                Save & Sync
              </Button>
            </Card>

            <Card>
              <SectionHeader title="Calendar Events" meta="Manual only" />
              <div className="mt-4 space-y-3">
                {state.events.filter((event) => event.source !== "ics").map((event, index) => (
                  <div key={event.id} className="grid gap-3">
                    <input
                      className="rounded-xl border border-border bg-surface2 px-3 py-2 text-sm text-text"
                      placeholder="Event title"
                      value={event.title}
                      onChange={(e) => {
                        const next = state.events.map((item) =>
                          item.id === event.id ? { ...event, title: e.target.value } : item
                        );
                        setState({ ...state, events: next });
                      }}
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        className="w-full rounded-xl border border-border bg-surface2 px-3 py-2 text-sm text-text"
                        value={event.date}
                        onChange={(e) => {
                          const next = state.events.map((item) =>
                            item.id === event.id ? { ...event, date: e.target.value, allDay: true } : item
                          );
                          setState({ ...state, events: next });
                        }}
                      />
                      <Button
                        variant="secondary"
                        onClick={() => {
                          const next = state.events.filter((item) => item.id !== event.id);
                          setState({ ...state, events: next });
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  variant="secondary"
                  onClick={() => setState({ ...state, events: [...state.events, createBlankEvent()] })}
                >
                  Add Event
                </Button>
                <Button className="ml-2" onClick={handleSaveEvents} disabled={saving}>
                  Save Events
                </Button>
              </div>
            </Card>
          </>
        ) : null}

        {activeTab === "layout" ? (
          <>
            {(Object.entries(state.layout.modules) as Array<[keyof HearthState["layout"]["modules"], HearthState["layout"]["modules"]["calendar"]]>)
              .sort((a, b) => a[1].order - b[1].order)
              .map(([key, layout]) => {
              const label = key === "calendar" ? "Calendar" : key === "photos" ? "Photos" : "Note";
              return (
                <Card key={key}>
                  <SectionHeader title={label} />
                  <div className="mt-4 flex flex-col gap-4">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-faint">Column</div>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        {(["left", "center", "right"] as const).map((column) => (
                          <Button
                            key={column}
                            variant={layout.column === column ? "primary" : "secondary"}
                            onClick={() => updateModuleLayout(key, { column })}
                          >
                            {column}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-faint">Width</div>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        {[1, 2, 3].map((span) => (
                          <Button
                            key={span}
                            variant={layout.span === span ? "primary" : "secondary"}
                            onClick={() => updateModuleLayout(key, { span: span as 1 | 2 | 3 })}
                          >
                            {span} col{span === 1 ? "" : "s"}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-faint">Order</div>
                      <div className="mt-2 flex items-center gap-3">
                        <Button variant="secondary" onClick={() => moveModule(key, "up")}>
                          Up
                        </Button>
                        <Button variant="secondary" onClick={() => moveModule(key, "down")}>
                          Down
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}

          </>
        ) : null}

        {activeTab === "photos" ? (
          <>
            <Card>
              <SectionHeader title="Photos Module" />
              <div className="mt-4">
                <Toggle
                  checked={state.modules.photos}
                  label="Enabled"
                  onChange={(next) => handleToggle("photos", next)}
                />
              </div>
              <div className="mt-4">
                <Toggle
                  checked={state.photoSources.google}
                  label="Use Google Photos"
                  onChange={async (next) => {
                    const updated = await updateState({ photoSources: { ...state.photoSources, google: next } });
                    setState(updated);
                  }}
                />
              </div>
              <div className="mt-4">
                <Toggle
                  checked={state.photoSources.local}
                  label="Use Local Photos"
                  onChange={async (next) => {
                    const updated = await updateState({ photoSources: { ...state.photoSources, local: next } });
                    setState(updated);
                  }}
                />
              </div>
              <div className="mt-4">
                <Toggle
                  checked={state.photoShuffle}
                  label="Shuffle slideshow"
                  onChange={async (next) => {
                    const updated = await updateState({ photoShuffle: next });
                    setState(updated);
                  }}
                />
              </div>
            </Card>
            <Card>
              <SectionHeader title="Photo Framing" />
              <div className="mt-4 text-sm text-muted">
                Adjust the default focus point for the slideshow.
              </div>
              <select
                className="mt-4 w-full rounded-xl border border-border bg-surface2 px-4 py-3 text-sm text-text"
                value={state.photoFocus}
                onChange={async (event) => {
                  const next = event.target.value as HearthState["photoFocus"];
                  const updated = await updateState({ photoFocus: next });
                  setState(updated);
                }}
              >
                <option value="none">None</option>
                <option value="center">Center</option>
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
                <option value="left">Left</option>
                <option value="right">Right</option>
                <option value="top-left">Top left</option>
                <option value="top-right">Top right</option>
                <option value="bottom-left">Bottom left</option>
                <option value="bottom-right">Bottom right</option>
              </select>
            </Card>
            {state.photoSources.google ? (
              <Card>
                <SectionHeader title="Google Photos" />
                <div className="mt-4 text-sm text-muted">
                  Connect on this host using localhost. This requires internet access during setup.
                  Choose photos to open the picker, then return here to sync automatically. If it does not open, use Open picker again.
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button variant="primary" onClick={() => (window.location.href = googleAuthUrl)}>
                    {googleStatus.connected ? "Reconnect Google" : "Connect Google"}
                  </Button>
                  {pickerUri ? (
                    <Button
                      variant="secondary"
                      onClick={() => pickerUri && window.open(pickerUri, "_blank")}
                      disabled={googleLoading}
                    >
                      Open picker again
                    </Button>
                  ) : null}
                  {pickerReady ? (
                    <Button variant="secondary" onClick={handleSyncNow} disabled={googleLoading}>
                      Sync now
                    </Button>
                  ) : null}
                  <Button variant="secondary" onClick={handleDisconnectGoogle} disabled={!googleStatus.connected || googleLoading}>
                    Disconnect
                  </Button>
                </div>
                <div className="mt-4">
                  <Button variant="secondary" onClick={handleChoosePhotos} disabled={!googleStatus.connected || googleLoading}>
                    Choose photos
                  </Button>
                </div>
                <div className="mt-4 text-sm text-muted">
                  {googleStatus.connected ? "Connected." : "Not connected."}{" "}
                  {pickerSessionId ? "Picker session started." : ""}
                  {pickerAutoSync ? " Waiting for selection..." : ""}
                  {pickerReady ? " Selection ready to sync." : ""}
                </div>
              </Card>
            ) : null}
            {state.photoSources.local ? (
              <Card>
                <SectionHeader title="Local Photos" />
                <div className="mt-4 text-sm text-muted">
                  Point Hearth to a local folder on the server and scan it for images.
                </div>
                <input
                  className="mt-4 w-full rounded-xl border border-border bg-surface2 px-4 py-3 text-sm text-text"
                  placeholder="/data/photos"
                  value={localPhotosDir}
                  onChange={(event) => setLocalPhotosDir(event.target.value)}
                />
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button
                    variant="secondary"
                    onClick={() => handleSaveLocalPhotos(true)}
                    disabled={localPhotosLoading}
                  >
                    Save & Scan
                  </Button>
                </div>
              </Card>
            ) : null}
          </>
        ) : null}

        {activeTab === "weather" ? (
          <>
            <Card>
              <SectionHeader title="Current Weather" />
              <div className="mt-4">
                <Toggle
                  checked={state.modules.weather}
                  label="Show current weather"
                  onChange={(next) => handleToggle("weather", next)}
                />
              </div>
              <div className="mt-4">
                <Toggle
                  checked={state.weatherForecastEnabled}
                  label="Show 5-day forecast"
                  onChange={async (next) => {
                    const updated = await updateState({ weatherForecastEnabled: next });
                    setState(updated);
                  }}
                />
              </div>
            </Card>

            <Card>
              <SectionHeader title="Weather Location" meta="Postal code" />
              <div className="mt-4 text-sm text-muted">
                Enter a postal code or city name. International postcodes are supported.
              </div>
              <input
                className="mt-4 w-full rounded-xl border border-border bg-surface2 px-4 py-3 text-sm text-text"
                placeholder="e.g. 94107 or SW1A 1AA or Toronto"
                value={weatherQuery}
                onChange={(event) => setWeatherQuery(event.target.value)}
              />
              <div className="mt-4 flex items-center justify-end gap-3">
                <Button
                  variant={state.tempUnit === "f" ? "primary" : "secondary"}
                  onClick={async () => {
                    const updated = await updateState({ tempUnit: "f" });
                    setState(updated);
                    if (weatherQuery.trim()) {
                      await updateWeatherSettings(weatherQuery.trim(), true);
                    }
                  }}
                  disabled={saving}
                >
                  Fahrenheit
                </Button>
                <Button
                  variant={state.tempUnit === "c" ? "primary" : "secondary"}
                  onClick={async () => {
                    const updated = await updateState({ tempUnit: "c" });
                    setState(updated);
                    if (weatherQuery.trim()) {
                      await updateWeatherSettings(weatherQuery.trim(), true);
                    }
                  }}
                  disabled={saving}
                >
                  Celsius
                </Button>
              </div>
              <Button className="mt-4" onClick={handleSaveWeather} disabled={weatherSyncing}>
                Save & Sync
              </Button>
            </Card>
          </>
        ) : null}

        {activeTab === "about" ? (
          <>
            <Card>
              <SectionHeader title="About" />
              <div className="mt-4 space-y-3 text-sm text-muted">
                <div>
                  Created by{" "}
                  <a className="text-accent underline" href="https://www.84boxes.com" target="_blank" rel="noreferrer">
                    84boxes
                  </a>
                  .
                </div>
                <div>Licensed under the MIT license.</div>
                <div>
                  Issues and updates:{" "}
                  <a
                    className="text-accent underline"
                    href="https://github.com/karlhills/hearth-display"
                    target="_blank"
                    rel="noreferrer"
                  >
                    github.com/karlhills/hearth-display
                  </a>
                </div>
              </div>
              <Button
                className="mt-6"
                variant="primary"
                onClick={() => window.open("https://buymeacoffee.com/84boxes", "_blank", "noreferrer")}
              >
                Buy me a coffee
              </Button>
            </Card>
          </>
        ) : null}
      </div>
      {customThemeOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4">
          <div
            className="w-full max-h-[85vh] max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-6 text-text shadow-xl"
            style={{
              backgroundColor: "var(--surface)",
              color: "var(--text)"
            }}
          >
            <SectionHeader title="Custom Theme" />
            <div className="mt-4 grid gap-4 text-sm">
              {(
                [
                  ["bg", "Background", "Base page background behind everything."],
                  ["surface", "Surface", "Main card background (panels, sections, calendar container)."],
                  ["surface2", "Surface 2", "Secondary card background (inputs, pills, small panels)."],
                  ["calendarDay", "Calendar Day", "Day cell background in the calendar grid."],
                  ["calendarDayMuted", "Calendar Day (Muted)", "Muted day cells (outside current month)."],
                  ["calendarToday", "Calendar Today", "Highlight for the current day cell."],
                  ["border", "Border", "Borders around cards, inputs, and tables."],
                  ["text", "Text", "Primary text color."],
                  ["buttonText", "Button Text", "Text on primary/secondary buttons."],
                  ["buttonTextOnAccent", "Button Text (Accent)", "Text on accent-colored buttons."],
                  ["muted", "Muted", "Secondary text (labels, subheadings)."],
                  ["faint", "Faint", "Tertiary text (helper hints, subtle labels)."],
                  ["accent", "Accent", "Highlights, icons, and focus accents."]
                ] as const
              ).map(([key, label, hint]) => (
                <label key={key} className="grid gap-2">
                  <span className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-[0.2em] text-faint" style={{ color: "var(--text)" }}>
                      {label}
                    </span>
                    <span className="relative inline-flex items-center">
                      <button
                        type="button"
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface2 text-[10px] font-semibold text-muted"
                        aria-label={`${label} info`}
                        onClick={() => setThemeHintOpen(themeHintOpen === key ? null : key)}
                        onBlur={() => setThemeHintOpen(null)}
                      >
                        i
                      </button>
                      {themeHintOpen === key ? (
                        <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-56 -translate-x-1/2 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted shadow-lg">
                          {hint}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      className="h-10 w-14 cursor-pointer rounded-lg border border-border bg-surface2"
                      value={toHexColor(customDraft[key])}
                      onChange={(event) => setCustomDraft({ ...customDraft, [key]: event.target.value })}
                    />
                    <input
                      className="w-full rounded-xl border border-border bg-surface2 px-4 py-2 text-sm text-text"
                      value={customDraft[key]}
                      onChange={(event) => setCustomDraft({ ...customDraft, [key]: event.target.value })}
                    />
                  </div>
                </label>
              ))}
            </div>
            <div className="mt-6">
              <div className="text-xs uppercase tracking-[0.2em] text-faint" style={{ color: "var(--text)" }}>
                Card Opacity
              </div>
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={customDraft.cardOpacity}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setCustomDraft({
                      ...customDraft,
                      cardOpacity: Number.isFinite(next) ? clampOpacity(next) : customDraft.cardOpacity
                    });
                  }}
                  className="w-full"
                />
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  value={customDraft.cardOpacity}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setCustomDraft({
                      ...customDraft,
                      cardOpacity: Number.isFinite(next) ? clampOpacity(next) : customDraft.cardOpacity
                    });
                  }}
                  className="w-24 rounded-xl border border-border bg-surface2 px-4 py-2 text-sm text-text"
                />
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setCustomThemeOpen(false);
                  setCustomDraft(state.customTheme);
                }}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button variant="secondary" onClick={handleResetCustomTheme} disabled={saving}>
                Reset to Dark
              </Button>
              <Button variant="secondary" onClick={handleResetLightTheme} disabled={saving}>
                Reset to Light
              </Button>
              <Button variant="primary" onClick={handleSaveCustomTheme} disabled={saving}>
                Save Theme
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {backgroundThemeOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4">
          <div
            className="w-full max-h-[85vh] max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-6 text-text shadow-xl"
            style={{
              backgroundColor: "var(--surface)",
              color: "var(--text)"
            }}
          >
            <SectionHeader title="Background Image" />
            <div className="mt-6">
              <div className="text-xs uppercase tracking-[0.2em] text-faint" style={{ color: "var(--text)" }}>
                Background Image
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      handleThemeBackgroundUpload(file);
                      event.currentTarget.value = "";
                    }
                  }}
                />
                <Button variant="secondary" onClick={handleClearThemeBackground} disabled={saving || !customDraft.backgroundImage}>
                  Clear background
                </Button>
              </div>
              {customDraft.backgroundImage ? (
                <div className="mt-2 text-xs text-muted">Background set.</div>
              ) : (
                <div className="mt-2 text-xs text-faint">No background image.</div>
              )}
            </div>
            <div className="mt-6">
              <div className="text-xs uppercase tracking-[0.2em] text-faint" style={{ color: "var(--text)" }}>
                Background Position
              </div>
              <select
                className="mt-2 w-full rounded-xl border border-border bg-surface2 px-4 py-2 text-sm text-text"
                value={customDraft.backgroundPosition}
                onChange={(event) =>
                  setCustomDraft({
                    ...customDraft,
                    backgroundPosition: event.target.value as HearthState["photoFocus"]
                  })
                }
              >
                <option value="center">Center</option>
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
                <option value="left">Left</option>
                <option value="right">Right</option>
                <option value="top-left">Top left</option>
                <option value="top-right">Top right</option>
                <option value="bottom-left">Bottom left</option>
                <option value="bottom-right">Bottom right</option>
              </select>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setBackgroundThemeOpen(false);
                  setCustomDraft(state.customTheme);
                }}
                disabled={saving}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
