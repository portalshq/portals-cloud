# Lore Cloud Control Plane — Multi-stage Dockerfile
# Usage:
#   docker build -t lorecloud-control-plane -f docker/control-plane/Dockerfile .
#   docker run --env-file .env lorecloud-control-plane

# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM rust:1.97-slim-bookworm@sha256:2775a09d208ff0d7c1f50490c45b62db929e87ba1dcbc3f2132ac71a704bcdd3 AS builder

RUN apt-get update && \
    apt-get install -y --no-install-recommends pkg-config libssl-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cache dependencies: copy all Cargo.toml files first, create stub src files,
# build deps only. Real source is copied after this layer.
COPY control-plane/Cargo.toml /app/control-plane/Cargo.toml
COPY control-plane/Cargo.lock /app/control-plane/Cargo.lock
COPY control-plane/api/Cargo.toml /app/control-plane/api/Cargo.toml
COPY control-plane/auth-gateway/Cargo.toml /app/control-plane/auth-gateway/Cargo.toml
COPY control-plane/config/Cargo.toml /app/control-plane/config/Cargo.toml
COPY control-plane/controllers/Cargo.toml /app/control-plane/controllers/Cargo.toml
COPY control-plane/controllers/audit/Cargo.toml /app/control-plane/controllers/audit/Cargo.toml
COPY control-plane/controllers/quota/Cargo.toml /app/control-plane/controllers/quota/Cargo.toml
COPY control-plane/controllers/permissions/Cargo.toml /app/control-plane/controllers/permissions/Cargo.toml
COPY control-plane/controllers/billing/Cargo.toml /app/control-plane/controllers/billing/Cargo.toml
COPY control-plane/controllers/gc/Cargo.toml /app/control-plane/controllers/gc/Cargo.toml
COPY control-plane/controllers/session/Cargo.toml /app/control-plane/controllers/session/Cargo.toml
COPY control-plane/controllers/storage/Cargo.toml /app/control-plane/controllers/storage/Cargo.toml
COPY control-plane/controllers/world/Cargo.toml /app/control-plane/controllers/world/Cargo.toml
COPY control-plane/controllers/channel/Cargo.toml /app/control-plane/controllers/channel/Cargo.toml
COPY control-plane/controllers/capability-deployment/Cargo.toml /app/control-plane/controllers/capability-deployment/Cargo.toml
COPY control-plane/controllers/runtime-scheduling/Cargo.toml /app/control-plane/controllers/runtime-scheduling/Cargo.toml
COPY control-plane/controllers/resolver/Cargo.toml /app/control-plane/controllers/resolver/Cargo.toml
COPY control-plane/controllers/audience-session/Cargo.toml /app/control-plane/controllers/audience-session/Cargo.toml
COPY control-plane/events/Cargo.toml /app/control-plane/events/Cargo.toml
COPY control-plane/models/Cargo.toml /app/control-plane/models/Cargo.toml
COPY control-plane/observability/Cargo.toml /app/control-plane/observability/Cargo.toml
COPY control-plane/persistence/Cargo.toml /app/control-plane/persistence/Cargo.toml
COPY control-plane/providers/Cargo.toml /app/control-plane/providers/Cargo.toml
COPY control-plane/providers/trait/Cargo.toml /app/control-plane/providers/trait/Cargo.toml
COPY control-plane/providers/aws/Cargo.toml /app/control-plane/providers/aws/Cargo.toml
COPY control-plane/providers/mock/Cargo.toml /app/control-plane/providers/mock/Cargo.toml
COPY control-plane/reconciler/Cargo.toml /app/control-plane/reconciler/Cargo.toml
COPY control-plane/server/Cargo.toml /app/control-plane/server/Cargo.toml
COPY control-plane/tests/Cargo.toml /app/control-plane/tests/Cargo.toml
COPY control-plane/workflows/Cargo.toml /app/control-plane/workflows/Cargo.toml

# Create minimal stub source files so `cargo build` can resolve deps.
# Each crate needs a lib.rs or main.rs to compile.
RUN for crate in models events observability config controllers providers providers/trait providers/aws providers/mock persistence reconciler workflows server tests; do \
        mkdir -p /app/control-plane/$crate/src && \
        echo "pub fn init() {}" > /app/control-plane/$crate/src/lib.rs; \
    done && \
    mkdir -p /app/control-plane/api/src /app/control-plane/auth-gateway/src && \
    echo "fn main() {}" > /app/control-plane/api/src/main.rs && \
    echo "fn main() {}" > /app/control-plane/auth-gateway/src/main.rs && \
    mkdir -p /app/control-plane/server/src && \
    echo "fn main() {}" > /app/control-plane/server/src/main.rs && \
    for controller in audit quota permissions billing gc session storage world channel capability-deployment runtime-scheduling resolver audience-session; do \
        mkdir -p /app/control-plane/controllers/$controller/src && \
        echo "pub fn init() {}" > /app/control-plane/controllers/$controller/src/lib.rs; \
    done

# Pre-build dependencies (this layer is cached unless Cargo.toml changes)
RUN cd /app/control-plane && cargo build --release --bin lorecloud-control-plane

# Now copy real source and build the binary
COPY control-plane/ /app/control-plane/
# COPY preserves checkout mtimes, which can be older than the dep-cache layer's
# compiled artifacts; cargo fingerprints by mtime and would skip rebuilding the
# workspace crates, linking the binary against the stub libs above.
RUN find /app/control-plane -name '*.rs' -exec touch {} +
RUN cd /app/control-plane && cargo build --release --bin lorecloud-control-plane

# ── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM debian:bookworm-slim@sha256:abd67ffcfa541b485a3dff59865ab629aa048a6c613e639d36e7456b0b229241 AS runtime

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
