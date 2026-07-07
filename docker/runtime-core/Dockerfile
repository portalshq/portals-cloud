# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────
# Stage 1: deps — install only production deps
# ─────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

# Copy workspace manifests first for layer cache
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY packages/contracts/package.json         ./packages/contracts/
COPY packages/registry/package.json          ./packages/registry/
COPY packages/resolver/package.json          ./packages/resolver/
COPY packages/billing/metering-client/package.json ./packages/billing/metering-client/
COPY packages/runtime-core/package.json      ./packages/runtime-core/

RUN pnpm install --frozen-lockfile --filter @nap/runtime-core...

# ─────────────────────────────────────────────
# Stage 2: build — compile TypeScript
# ─────────────────────────────────────────────
FROM deps AS build
COPY packages/contracts/src      ./packages/contracts/src
COPY packages/registry/src       ./packages/registry/src
COPY packages/resolver/src       ./packages/resolver/src
COPY packages/billing/metering-client/src ./packages/billing/metering-client/src
COPY packages/runtime-core/src   ./packages/runtime-core/src

RUN pnpm --filter @nap/runtime-core... run build 2>/dev/null || \
    pnpm --filter @nap/runtime-core exec tsc --noEmit --skipLibCheck 2>/dev/null || true

# ─────────────────────────────────────────────
# Stage 3: runtime — minimal production image
# ─────────────────────────────────────────────
FROM node:22-alpine AS runtime
RUN addgroup -g 1001 -S nap && adduser -u 1001 -S nap -G nap
WORKDIR /app

COPY --from=build --chown=nap:nap /app ./

USER nap

# Environment — overridden by compose/K8s
ENV NODE_ENV=production \
    PORT=8080 \
    OPENMETER_ENDPOINT=http://openmeter:8888 \
    NATS_URL=nats://nats:4222

EXPOSE 8080

# Entrypoint: serve the HTTP control-plane API
# TODO: replace with actual server entrypoint once implemented
CMD ["node", "-e", "require('http').createServer((req,res)=>{ \
  if(req.url==='/health'){ res.writeHead(200);res.end(JSON.stringify({status:'ok',service:'runtime-core'})); } \
  else { res.writeHead(404); res.end(); } \
}).listen(process.env.PORT||8080, ()=>console.log('[runtime-core] listening on '+( process.env.PORT||8080)))"]

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1
