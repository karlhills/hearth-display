import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { z } from "zod";
import { initDb, loadState, saveState, getSetting, setSetting } from "./storage/db.js";
import { createDefaultState } from "./storage/seed.js";
import { createSseManager } from "./realtime/sse.js";
import { registerPublicRoutes } from "./routes/public.js";
import { registerControlRoutes } from "./routes/control.js";
import { generatePairingCode } from "./auth/pairing.js";
import { startCalendarSync } from "./calendar/sync.js";
import { startWeatherSync } from "./weather/sync.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envCandidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "..", ".env"),
  path.resolve(__dirname, "../../.env")
];

for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

const envSchema = z.object({
  PORT: z.coerce.number().default(8787),
  HOST: z.string().default("0.0.0.0"),
  DATA_PATH: z.string().default("./data/hearth.db"),
  TOKEN_SECRET: z.string().optional(),
  GOOGLE_PHOTOS_CLIENT_ID: z.string().optional(),
  GOOGLE_PHOTOS_CLIENT_SECRET: z.string().optional(),
  GOOGLE_PHOTOS_REDIRECT_URI: z.string().optional(),
  GOOGLE_PHOTOS_CACHE_DIR: z.string().optional(),
  DEV_CONTROL_ORIGIN: z.string().optional(),
  LAN_IP: z.string().optional(),
  THEME_ASSETS_DIR: z.string().optional()
});

const env = envSchema.parse(process.env);
let dataPath = env.DATA_PATH;
if (dataPath.startsWith("/data") && !fs.existsSync("/data")) {
  dataPath = path.resolve(process.cwd(), "data/hearth.db");
  console.warn("DATA_PATH /data not found. Falling back to local ./data/hearth.db");
}

const displayPath = path.resolve(__dirname, "../../apps/display/dist");
const controlPath = path.resolve(__dirname, "../../apps/control/dist");

const fastify = Fastify({
  logger: true
});

const db = await initDb(dataPath);

let pairingCode = await getSetting(db, "pairingCode");
if (!pairingCode) {
  pairingCode = generatePairingCode();
  await setSetting(db, "pairingCode", pairingCode);
}
fastify.log.info(`Hearth pairing code: ${pairingCode}`);

let deviceId = await getSetting(db, "deviceId");
if (!deviceId) {
  deviceId = crypto.randomUUID();
  await setSetting(db, "deviceId", deviceId);
}
fastify.log.info(`Hearth display deviceId: ${deviceId}`);

let tokenSecret = await getSetting(db, "tokenSecret");
if (!tokenSecret) {
  tokenSecret = env.TOKEN_SECRET || crypto.randomUUID();
  await setSetting(db, "tokenSecret", tokenSecret);
}

const existingState = await loadState(db);
if (!existingState) {
  const seeded = createDefaultState();
  await saveState(db, seeded);
}

const sse = createSseManager();

const hasDisplayAssets = fs.existsSync(displayPath);
const hasControlAssets = fs.existsSync(controlPath);

if (hasDisplayAssets) {
  await fastify.register(fastifyStatic, {
    root: displayPath,
    prefix: "/display/"
  });
} else {
  fastify.log.warn("Display assets not found. Build the display app or use pnpm dev.");
}

if (hasControlAssets) {
  await fastify.register(fastifyStatic, {
    root: controlPath,
    prefix: "/control/",
    decorateReply: false
  });
} else {
  fastify.log.warn("Control assets not found. Build the control app or use pnpm dev.");
}

registerPublicRoutes(fastify, { db, sse, deviceId });
registerControlRoutes(fastify, { db, sse, tokenSecret });

startCalendarSync(db, (state) => {
  sse.broadcastAll(state as Parameters<typeof sse.broadcastAll>[0]);
});

startWeatherSync(db, (state) => {
  sse.broadcastAll(state as Parameters<typeof sse.broadcastAll>[0]);
});


fastify.get("/", async (_, reply) => {
  reply.redirect("/display/");
});

fastify.get("/display", async (_, reply) => {
  reply.redirect("/display/");
});

fastify.get("/control", async (_, reply) => {
  reply.redirect("/control/");
});


await fastify.listen({ port: env.PORT, host: env.HOST });
fastify.log.info(`Hearth running on http://${env.HOST}:${env.PORT}`);
