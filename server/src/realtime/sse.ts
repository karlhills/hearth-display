import type { FastifyReply, FastifyRequest } from "fastify";
import type { HearthState } from "@hearth/shared";

type Client = {
  reply: FastifyReply;
  heartbeat: NodeJS.Timeout;
};

export function createSseManager() {
  const clients = new Map<string, Set<Client>>();

  function addClient(deviceId: string, request: FastifyRequest, reply: FastifyReply) {
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });

    reply.raw.write(":connected\n\n");

    const heartbeat = setInterval(() => {
      reply.raw.write(":heartbeat\n\n");
    }, 25000);

    const client: Client = { reply, heartbeat };
    const set = clients.get(deviceId) ?? new Set<Client>();
    set.add(client);
    clients.set(deviceId, set);

    request.raw.on("close", () => {
      clearInterval(heartbeat);
      set.delete(client);
      if (set.size === 0) {
        clients.delete(deviceId);
      }
    });
  }

  function broadcast(deviceId: string, state: HearthState) {
    const set = clients.get(deviceId);
    if (!set) return;
    const data = JSON.stringify(state);
    for (const client of set) {
      client.reply.raw.write(`event: state\ndata: ${data}\n\n`);
    }
  }

  function broadcastEvent(deviceId: string, event: string, data: unknown = {}) {
    const set = clients.get(deviceId);
    if (!set) return;
    const payload = JSON.stringify(data);
    for (const client of set) {
      client.reply.raw.write(`event: ${event}\ndata: ${payload}\n\n`);
    }
  }

  function broadcastAll(state: HearthState) {
    for (const deviceId of clients.keys()) {
      broadcast(deviceId, state);
    }
  }

  return {
    addClient,
    broadcast,
    broadcastAll,
    broadcastEvent
  };
}
