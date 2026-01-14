import type { HearthState, PublicStateResponse } from "@hearth/shared";

const TOKEN_KEY = "hearth-token";

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function fetchState(): Promise<PublicStateResponse> {
  const res = await fetch("/api/state");
  if (!res.ok) {
    throw new Error("Failed to load state");
  }
  return (await res.json()) as PublicStateResponse;
}

export async function fetchPairingCode() {
  const res = await fetch("/api/pairing");
  if (!res.ok) {
    throw new Error("Failed to load pairing code");
  }
  return (await res.json()) as { code: string };
}

export async function pair(code: string) {
  const res = await fetch("/api/control/pair", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ code })
  });

  if (!res.ok) {
    throw new Error("Invalid pairing code");
  }

  const data = (await res.json()) as { token: string };
  setStoredToken(data.token);
  return data.token;
}

function authHeaders() {
  const token = getStoredToken();
  return {
    "Content-Type": "application/json",
    Authorization: token ? `Bearer ${token}` : ""
  };
}

export async function updateState(next: Partial<HearthState>) {
  const res = await fetch("/api/control/state", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ state: next })
  });
  if (!res.ok) {
    throw new Error("Failed to update state");
  }
  return (await res.json()) as HearthState;
}

export async function toggleModule(module: string, enabled: boolean) {
  const res = await fetch("/api/control/modules/toggle", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ module, enabled })
  });
  if (!res.ok) {
    throw new Error("Failed to toggle module");
  }
  return (await res.json()) as HearthState;
}

export async function updateLayout(layout: HearthState["layout"]) {
  const res = await fetch("/api/control/layout", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ layout })
  });
  if (!res.ok) {
    throw new Error("Failed to update layout");
  }
  return (await res.json()) as HearthState;
}

export async function fetchCalendarSettings() {
  const res = await fetch("/api/control/calendar/settings", {
    headers: authHeaders()
  });
  if (!res.ok) {
    throw new Error("Failed to load calendar settings");
  }
  return (await res.json()) as { icsUrl: string };
}

export async function updateCalendarSettings(icsUrl: string, syncNow: boolean) {
  const res = await fetch("/api/control/calendar/settings", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ icsUrl, syncNow })
  });
  if (!res.ok) {
    throw new Error("Failed to update calendar settings");
  }
  return (await res.json()) as { ok: true };
}

export async function fetchWeatherSettings() {
  const res = await fetch("/api/control/weather/settings", {
    headers: authHeaders()
  });
  if (!res.ok) {
    throw new Error("Failed to load weather settings");
  }
  return (await res.json()) as { query: string };
}

export async function updateWeatherSettings(query: string, syncNow: boolean) {
  const res = await fetch("/api/control/weather/settings", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ query, syncNow })
  });
  if (!res.ok) {
    throw new Error("Failed to update weather settings");
  }
  return (await res.json()) as { ok: true };
}

export async function fetchGooglePhotosStatus() {
  const res = await fetch("/api/control/photos/google/status", {
    headers: authHeaders()
  });
  if (!res.ok) {
    throw new Error("Failed to load Google Photos status");
  }
  return (await res.json()) as { connected: boolean };
}

export async function fetchLocalPhotosSettings() {
  const res = await fetch("/api/control/photos/local/settings", {
    headers: authHeaders()
  });
  if (!res.ok) {
    throw new Error("Failed to load local photo settings");
  }
  return (await res.json()) as { directory: string };
}

export async function updateLocalPhotosSettings(directory: string) {
  const res = await fetch("/api/control/photos/local/settings", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ directory })
  });
  if (!res.ok) {
    throw new Error("Failed to update local photo settings");
  }
  return (await res.json()) as { ok: true };
}

export async function scanLocalPhotos(directory?: string) {
  const res = await fetch("/api/control/photos/local/scan", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ directory })
  });
  if (!res.ok) {
    throw new Error("Failed to scan local photos");
  }
  return (await res.json()) as { ok: true };
}

export async function uploadThemeBackground(dataUrl: string) {
  const res = await fetch("/api/control/theme/background", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ dataUrl })
  });
  if (!res.ok) {
    throw new Error("Failed to upload theme background");
  }
  return (await res.json()) as { url: string };
}

export async function clearThemeBackground() {
  const res = await fetch("/api/control/theme/background", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ clear: true })
  });
  if (!res.ok) {
    throw new Error("Failed to clear theme background");
  }
  return (await res.json()) as { url: string };
}

export async function createPickerSession() {
  const res = await fetch("/api/control/photos/picker/session", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({})
  });
  if (!res.ok) {
    throw new Error("Failed to create picker session");
  }
  return (await res.json()) as { sessionId: string; pickerUri: string };
}

export async function fetchPickerSession(sessionId: string) {
  const res = await fetch(`/api/control/photos/picker/session/${sessionId}`, {
    headers: authHeaders()
  });
  if (!res.ok) {
    throw new Error("Failed to fetch picker session");
  }
  return (await res.json()) as { mediaItemsSet: boolean };
}

export async function completePickerSession(sessionId: string) {
  const res = await fetch("/api/control/photos/picker/complete", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ sessionId })
  });
  if (!res.ok) {
    throw new Error("Failed to sync picker media");
  }
  return (await res.json()) as { ok: true };
}

export async function disconnectGooglePhotos() {
  const res = await fetch("/api/control/photos/google/disconnect", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({})
  });
  if (!res.ok) {
    throw new Error("Failed to disconnect Google Photos");
  }
  return (await res.json()) as { ok: true };
}
