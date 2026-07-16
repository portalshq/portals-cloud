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

# Cache dependencies: copy all Cargo.toml files first, create stub src files,
# build deps only. Real source is copied after this layer.
COPY control-plane/Cargo.toml /app/control-plane/Cargo.toml
COPY control-plane/Cargo.lock /app/control-plane/Cargo.lock
COPY control-plane/models/Cargo.toml /app/control-plane/models/Cargo.toml
COPY control-plane/api/Cargo.toml /app/control-plane/api/Cargo.toml
COPY control-plane/controllers/Cargo.toml /app/control-plane/controllers/Cargo.toml
COPY control-plane/events/Cargo.toml /app/control-plane/events/Cargo.toml
COPY control-plane/persistence/Cargo.toml /app/control-plane/persistence/Cargo.toml
COPY control-plane/providers/Cargo.toml /app/control-plane/providers/Cargo.toml
COPY control-plane/reconciler/Cargo.toml /app/control-plane/reconciler/Cargo.toml
COPY control-plane/observability/Cargo.toml /app/control-plane/observability/Cargo.toml
COPY control-plane/config/Cargo.toml /app/control-plane/config/Cargo.toml
COPY control-plane/workflows/Cargo.toml /app/control-plane/workflows/Cargo.toml

# Create minimal stub source files so `cargo build` can resolve deps.
# Each crate needs a lib.rs or main.rs to compile.
RUN for crate in models events observability config controllers providers persistence reconciler workflows; do \
        mkdir -p /app/control-plane/$crate/src && \
        echo "pub fn init() {}" > /app/control-plane/$crate/src/lib.rs; \
    done && \
    mkdir -p /app/control-plane/api/src && \
    echo "fn main() {}" > /app/control-plane/api/src/main.rs

# Pre-build dependencies (this layer is cached unless Cargo.toml changes)
RUN cd /app/control-plane && cargo build --release

# Now copy real source and build the binary
COPY control-plane/ /app/control-plane/
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
