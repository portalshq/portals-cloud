#!/bin/sh
# Full local environment bootstrap.
# Run once after `docker compose up -d` to seed Lago plans and create
# the OpenMeter meters (if not pre-configured via config.yaml).
# Safe to re-run — all operations are idempotent.

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Portals Platform local bootstrap ==="

echo ""
echo "--- [1/3] checking service health ---"
for SERVICE in "localhost:8888" "localhost:3000" "localhost:4222"; do
  for i in $(seq 1 30); do
    if nc -z $(echo $SERVICE | cut -d: -f1) $(echo $SERVICE | cut -d: -f2) 2>/dev/null; then
      echo "  $SERVICE: ready"
      break
    fi
    if [ $i -eq 30 ]; then echo "  $SERVICE: TIMEOUT — is docker compose up?"; exit 1; fi
    sleep 2
  done
done

echo ""
echo "--- [2/3] seeding Lago billing plans ---"
docker compose -f "$(dirname $SCRIPT_DIR)/docker-compose.yml" \
  run --rm lago-seed

echo ""
echo "--- [3/3] bootstrap complete ---"
echo ""
echo "Service URLs:"
echo "  runtime-core:       http://localhost:8080   (control plane API)"
echo "  capability-registry:http://localhost:8081"
echo "  OpenMeter:          http://localhost:8888   (usage metering)"
echo "  Lago (UI):          http://localhost:8080   -> proxied via lago-front:80"
echo "  Lago API:           http://localhost:3000"
echo "  NATS:               nats://localhost:4222"
echo "  Kafka (Redpanda):   localhost:9092"
echo "  ClickHouse:         http://localhost:8123"
echo "  Postgres (Lago):    localhost:5432"
echo "  Redis:              localhost:6379"
echo "  Stripe CLI:         webhook listener active (check logs)"
echo "  Grafana:            http://localhost:3001   (metrics)"
echo "  Prometheus:         http://localhost:9090"
echo ""
echo "Next step: open http://localhost:3001 to verify metrics flowing."
echo "Then emit a test event:"
echo '  curl -X POST http://localhost:8888/api/v1/events \'
echo '    -H "Content-Type: application/cloudevents+json" \'
echo '    -d '"'"'{"specversion":"1.0","id":"test-001","type":"capability.invoked","source":"portals-platform/test","subject":"dev-tenant-001","time":"'"'"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"'"'","datacontenttype":"application/json","data":{"capabilityId":"realtime-fanout","sessionId":"sess-001","channelId":"test-channel","durationMs":42}}'"'"
