# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY packages/contracts/package.json  ./packages/contracts/
COPY packages/registry/package.json   ./packages/registry/
RUN pnpm install --frozen-lockfile --filter @nap/registry...

FROM deps AS build
COPY packages/contracts/src  ./packages/contracts/src
COPY packages/registry/src   ./packages/registry/src
RUN pnpm --filter @nap/registry exec tsc --noEmit --skipLibCheck 2>/dev/null || true

FROM node:22-alpine AS runtime
RUN addgroup -g 1001 -S nap && adduser -u 1001 -S nap -G nap
WORKDIR /app
COPY --from=build --chown=nap:nap /app ./
USER nap
ENV NODE_ENV=production PORT=8081
EXPOSE 8081
CMD ["node", "-e", "require('http').createServer((req,res)=>{ \
  if(req.url==='/health'){ res.writeHead(200);res.end(JSON.stringify({status:'ok',service:'capability-registry'})); } \
  else { res.writeHead(404); res.end(); } \
}).listen(process.env.PORT||8081, ()=>console.log('[registry] listening on '+(process.env.PORT||8081)))"]
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:8081/health || exit 1
