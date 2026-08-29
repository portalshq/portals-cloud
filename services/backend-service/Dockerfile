ARG NODE_BASE_IMAGE=node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293
FROM ${NODE_BASE_IMAGE} AS builder
WORKDIR /app/services/backend-service
COPY services/backend-service/package.json services/backend-service/package-lock.json ./
RUN npm ci
COPY services/backend-service/tsconfig.json ./
COPY services/backend-service/src ./src
COPY services/invitation-service/src /app/services/invitation-service/src
COPY services/lead-processing/src /app/services/lead-processing/src
RUN npm run build

FROM ${NODE_BASE_IMAGE} AS runner
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
