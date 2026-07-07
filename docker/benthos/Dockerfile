FROM ghcr.io/redpanda-data/connect:4 AS runtime
COPY benthos.yaml /etc/connect/benthos.yaml
CMD ["/redpanda-connect", "run", "/etc/connect/benthos.yaml"]
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:4195/ready || exit 1
