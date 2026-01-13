FROM node:22-bookworm AS builder
WORKDIR /app
RUN corepack enable
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY server ./server
COPY tsconfig.base.json ./

RUN pnpm install
RUN pnpm -r build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/server /app/server
COPY --from=builder /app/apps /app/apps
COPY --from=builder /app/packages /app/packages

EXPOSE 8787
CMD ["node", "server/dist/index.js"]
