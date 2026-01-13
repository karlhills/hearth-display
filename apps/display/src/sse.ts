import type { HearthState } from "@hearth/shared";

export function subscribeToState(deviceId: string, onState: (state: HearthState) => void) {
  const source = new EventSource(`/api/display/${deviceId}/events`);

  source.addEventListener("state", (event) => {
    try {
      const data = JSON.parse((event as MessageEvent).data) as HearthState;
      onState(data);
    } catch (error) {
      console.error("Failed to parse SSE state", error);
    }
  });

  source.onerror = () => {
    console.warn("SSE connection lost");
  };

  return () => source.close();
}
