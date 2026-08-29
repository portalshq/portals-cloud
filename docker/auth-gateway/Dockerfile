# Builder runs natively on the build machine ($BUILDPLATFORM). amd64 is built
# natively and arm64 is produced by the cross toolchain, never by emulation.
FROM --platform=$BUILDPLATFORM rust:1.97-slim-bookworm@sha256:2775a09d208ff0d7c1f50490c45b62db929e87ba1dcbc3f2132ac71a704bcdd3 AS builder

# The public-host release uses an x86_64 t3.micro. Retain arm64 so the image
# publisher can still create a multi-architecture manifest when requested.
ARG TARGETPLATFORM
RUN case "$TARGETPLATFORM" in \
      linux/amd64|linux/arm64) : ;; \
      *) echo "unsupported TARGETPLATFORM: $TARGETPLATFORM (expected linux/amd64 or linux/arm64)" >&2; exit 1 ;; \
    esac
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config libssl-dev protobuf-compiler \
    gcc-aarch64-linux-gnu libc6-dev-arm64-cross binutils-aarch64-linux-gnu \
    && rm -rf /var/lib/apt/lists/*
RUN rustup target add aarch64-unknown-linux-gnu
WORKDIR /app
COPY control-plane/ /app/control-plane/
COPY infra/lore/lore/lore-proto/proto/auth_api.proto /app/infra/lore/lore/lore-proto/proto/auth_api.proto
COPY infra/lore/lore/lore-proto/proto/rebac_api.proto /app/infra/lore/lore/lore-proto/proto/rebac_api.proto
RUN cd /app/control-plane && \
    case "$TARGETPLATFORM" in \
      linux/arm64) \
        CARGO_INCREMENTAL=0 \
        RUSTFLAGS="-Cdebuginfo=0 -Clinker=aarch64-linux-gnu-gcc" \
        cargo build --release --target aarch64-unknown-linux-gnu --bin lore-auth-gateway \
        && cp target/aarch64-unknown-linux-gnu/release/lore-auth-gateway /auth-gateway-bin \
        ;; \
      linux/amd64) \
        CARGO_INCREMENTAL=0 \
        RUSTFLAGS="-Cdebuginfo=0" \
        cargo build --release --bin lore-auth-gateway \
        && cp target/release/lore-auth-gateway /auth-gateway-bin \
        ;; \
      *) echo "unsupported TARGETPLATFORM: $TARGETPLATFORM (expected linux/amd64 or linux/arm64)" >&2; exit 1 ;; \
    esac

FROM --platform=$TARGETPLATFORM gcr.io/distroless/cc-debian13:nonroot@sha256:d97bc0a941b8d4be647dc0ee75b264ddbb772f1ac5ba690a4309c00723b23775 AS runtime
COPY --from=builder /auth-gateway-bin /usr/local/bin/lore-auth-gateway
# Region-scoped AWS RDS trust roots. The checksum makes CA-bundle changes an
# explicit reviewed image update instead of an unpinned network dependency.
ADD --chown=65532:65532 --chmod=0444 \
    --checksum=sha256:b1711d12bae51838581281e23b6cb97b1074016873b4dafc80ed14002462dd77 \
    https://truststore.pki.rds.amazonaws.com/us-east-1/us-east-1-bundle.pem \
    /etc/ssl/certs/aws-rds-us-east-1-bundle.pem
USER nonroot:nonroot
EXPOSE 8084 8085 8086 8087
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=30s CMD ["/usr/local/bin/lore-auth-gateway", "healthcheck"]
ENTRYPOINT ["/usr/local/bin/lore-auth-gateway"]
