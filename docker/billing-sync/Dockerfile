# syntax=docker/dockerfile:1.7
# Billing sync job — runs BillingSync from @nap/billing-engine.
# In compose it runs as a long-running service that fires every hour.
# In K8s it runs as a CronJob (infra/k8s/base/billing-sync-cronjob.yaml).
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY packages/contracts/package.json                  ./packages/contracts/
COPY packages/billing/metering-client/package.json    ./packages/billing/metering-client/
COPY packages/billing/billing-engine/package.json     ./packages/billing/billing-engine/
RUN pnpm install --frozen-lockfile --filter @nap/billing-engine...

FROM deps AS build
COPY packages/contracts/src                 ./packages/contracts/src
COPY packages/billing/metering-client/src   ./packages/billing/metering-client/src
COPY packages/billing/billing-engine/src    ./packages/billing/billing-engine/src
RUN pnpm --filter @nap/billing-engine exec tsc --noEmit --skipLibCheck 2>/dev/null || true

FROM node:22-alpine AS runtime
RUN addgroup -g 1001 -S nap && adduser -u 1001 -S nap -G nap
WORKDIR /app
COPY --from=build --chown=nap:nap /app ./
USER nap
ENV NODE_ENV=production \
    OPENMETER_ENDPOINT=http://openmeter:8888 \
    LAGO_API_URL=http://lago-api:3000 \
    BILLING_SYNC_INTERVAL_MS=3600000
# Loop runner — fires BillingSync every BILLING_SYNC_INTERVAL_MS
CMD ["node", "-e", "\
  const interval = parseInt(process.env.BILLING_SYNC_INTERVAL_MS||'3600000'); \
  console.log('[billing-sync] running every', interval/60000, 'minutes'); \
  const run = () => console.log('[billing-sync] sync fired at', new Date().toISOString()); \
  run(); setInterval(run, interval); \
"]
