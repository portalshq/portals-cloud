#!/bin/sh
# Lago bootstrap — creates billing plans defined in @nap/billing-engine/src/plans.ts
# via the Lago REST API. Runs once after Lago starts up.
# Idempotent: Lago returns 422 on duplicate codes, which we treat as success.

set -e
LAGO_URL="${LAGO_API_URL:-http://lago-api:3000}"
LAGO_KEY="${LAGO_API_KEY:-your-lago-api-key}"
AUTH="Authorization: Bearer $LAGO_KEY"

wait_for_lago() {
  echo "[lago-seed] waiting for Lago API..."
  for i in $(seq 1 30); do
    if wget -qO- "$LAGO_URL/api/v1/plans" --header "$AUTH" >/dev/null 2>&1; then
      echo "[lago-seed] Lago is ready"
      return 0
    fi
    sleep 5
  done
  echo "[lago-seed] Lago did not start in time"
  exit 1
}

create_plan() {
  NAME="$1"
  PAYLOAD="$2"
  echo "[lago-seed] creating plan: $NAME"
  STATUS=$(wget -qO- --method POST \
    --header "$AUTH" \
    --header "Content-Type: application/json" \
    --body-data "$PAYLOAD" \
    --server-response \
    "$LAGO_URL/api/v1/plans" 2>&1 | grep "HTTP/" | awk '{print $2}' | tail -1)
  if [ "$STATUS" = "200" ] || [ "$STATUS" = "201" ] || [ "$STATUS" = "422" ]; then
    echo "[lago-seed] $NAME: ok (status $STATUS)"
  else
    echo "[lago-seed] $NAME: unexpected status $STATUS"
  fi
}

wait_for_lago

# Developer Base Plan — hybrid usage + subscription
create_plan "nap-developer-base" '{
  "plan": {
    "name": "Portals Developer Base",
    "code": "nap-developer-base",
    "interval": "monthly",
    "amount_cents": 0,
    "amount_currency": "USD",
    "pay_in_advance": false,
    "charges": [
      {
        "billable_metric_code": "capability-invocations",
        "charge_model": "graduated",
        "properties": {
          "graduated_ranges": [
            {"from_value": 0,       "to_value": 100000,  "per_unit_amount": "0",      "flat_amount": "0"},
            {"from_value": 100001,  "to_value": 1000000, "per_unit_amount": "0.0001", "flat_amount": "0"},
            {"from_value": 1000001, "to_value": null,    "per_unit_amount": "0.00005","flat_amount": "0"}
          ]
        }
      },
      {
        "billable_metric_code": "session-minutes",
        "charge_model": "standard",
        "properties": { "amount": "0.02" }
      },
      {
        "billable_metric_code": "storage-written-bytes",
        "charge_model": "graduated",
        "properties": {
          "graduated_ranges": [
            {"from_value": 0,          "to_value": 1073741824, "per_unit_amount": "0",         "flat_amount": "0"},
            {"from_value": 1073741825, "to_value": null,       "per_unit_amount": "0.0000001", "flat_amount": "0"}
          ]
        }
      }
    ]
  }
}'

# Live Event Add-on
create_plan "nap-live-event" '{
  "plan": {
    "name": "Portals Live Event",
    "code": "nap-live-event",
    "interval": "monthly",
    "amount_cents": 0,
    "amount_currency": "USD",
    "pay_in_advance": true,
    "charges": [
      {
        "billable_metric_code": "peak-concurrent-viewers",
        "charge_model": "package",
        "properties": { "amount": "0.01", "package_size": 1, "free_units": 0 }
      }
    ]
  }
}'

# Enterprise Plan
create_plan "nap-enterprise" '{
  "plan": {
    "name": "Portals Enterprise",
    "code": "nap-enterprise",
    "interval": "monthly",
    "amount_cents": 500000,
    "amount_currency": "USD",
    "pay_in_advance": true,
    "charges": []
  }
}'

echo "[lago-seed] all plans seeded"
