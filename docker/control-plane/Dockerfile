# syntax=docker/dockerfile:1.7-labs
# Lore Cloud Control Plane — Multi-stage Dockerfile
# Usage:
#   docker build -t lorecloud-control-plane -f docker/control-plane/Dockerfile .
#   docker run --env-file .env lorecloud-control-plane

# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM rust:1.97-slim-bookworm AS builder

RUN apt-get update && \
    apt-get install -y --no-install-recommends pkg-config libssl-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the entire control-plane source
COPY control-plane/ /app/control-plane/

# Build the binary
RUN cd /app/control-plane && cargo build --release --bin lorecloud-control-plane

# ── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

# wget is needed for healthchecks (available in bookworm-slim; curl is not)
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates wget && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r lorecloud && useradd -r -g lorecloud -m lorecloud

COPY --from=builder /app/control-plane/target/release/lorecloud-control-plane /usr/local/bin/lorecloud-control-plane

# Ensure the binary is executable
RUN chmod +x /usr/local/bin/lorecloud-control-plane

USER lorecloud

EXPOSE 8083

# Healthcheck uses wget (available in slim image), not curl
HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=30s \
    CMD wget -qO- http://localhost:8083/healthz || exit 1

ENTRYPOINT ["lorecloud-control-plane"]
