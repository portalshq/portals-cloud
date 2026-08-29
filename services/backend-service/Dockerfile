ARG NODE_BASE_IMAGE=node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293
FROM ${NODE_BASE_IMAGE} AS builder
RUN apk upgrade --no-cache
# Install at the common services parent. TypeScript resolves dependencies from
# each imported source file upward, so sibling invitation/lead sources must see
# the same node_modules tree as Backend during an isolated container build.
WORKDIR /app/services
COPY services/backend-service/package.json services/backend-service/package-lock.json ./
RUN npm ci
COPY services/backend-service/tsconfig.json ./backend-service/tsconfig.json
COPY services/backend-service/src ./backend-service/src
COPY services/invitation-service/src /app/services/invitation-service/src
COPY services/lead-processing/src /app/services/lead-processing/src
RUN ./node_modules/.bin/tsc -p backend-service/tsconfig.json

FROM ${NODE_BASE_IMAGE} AS runner
RUN apk upgrade --no-cache
WORKDIR /app
ENV NODE_ENV=production
COPY services/backend-service/package.json services/backend-service/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/services/backend-service/dist ./dist
COPY services/invitation-service/templates ./templates
EXPOSE 8088
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8088/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/backend-service/src/index.js"]
