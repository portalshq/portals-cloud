# ADR 0005: Docker Compose production parity strategy

## Status
Accepted

## Context
The team needs a local development environment that catches integration
issues before they reach the LKE cluster. "Production parity" means the
same images, same service names (so env vars are identical), same startup
ordering, and same health-check gates as prod.

## Service inventory

| Service | Image | Role | Prod equivalent |
|---|---|---|---|
| postgres | postgres:16-alpine | Lago persistence | Linode managed Postgres |
| redis | redis:7-alpine | Lago Sidekiq queue | Linode managed Redis |
| clickhouse | clickhouse/clickhouse-server:24 | OpenMeter aggregation store | Same image on LKE |
| kafka | redpandadata/redpanda:v24.2 | OpenMeter event ingest buffer | Real Kafka on LKE |
| nats | nats:2.10-alpine | realtime-fanout pub/sub bus | Same image on LKE |
| minio | minio/minio | Object storage (world state, assets) | Linode Object Storage |
| openmeter | ghcr.io/openmeterio/openmeter | Usage metering aggregation | Same Helm chart on LKE |
| lago-api | getlago/api:v1.39.0 | Billing engine + invoice API | Same Helm chart on LKE |
| lago-front | getlago/front | Billing dashboard UI | Same image on LKE |
| lago-worker | getlago/api:v1.39.0 | Lago Sidekiq background jobs | Same image on LKE |
| runtime-core | ./docker/runtime-core | Portals control plane | Built image on LKE |
| registry | ./docker/registry | Capability registry | Built image on LKE |
| benthos | ./docker/benthos | NATS→OpenMeter bridge | Same image on LKE |
| billing-sync | ./docker/billing-sync | Hourly billing sync job | K8s CronJob on LKE |
| prometheus | prom/prometheus:v2.53 | Metrics collection | Same Helm chart on LKE |
| grafana | grafana/grafana:11.1 | Metrics visualization | Same Helm chart on LKE |
| stripe-cli | stripe/stripe-cli | Webhook forwarding | Not in prod (Stripe sends direct) |
| lago-seed | alpine (one-shot) | Seeds Lago billing plans | K8s Job on LKE |
| minio-init | minio/mc (one-shot) | Creates S3 buckets | Terraform on LKE |

## Deliberate differences from prod

| Difference | Compose | Prod (LKE) | Why acceptable |
|---|---|---|---|
| Kafka | Redpanda single node | Real Kafka cluster | Kafka wire-compatible; same topics, same config |
| Object storage | MinIO | Linode Object Storage | S3-API compatible; endpoint only differs |
| billing-sync | Long-running loop | K8s CronJob | Same code, different scheduler |
| lago-seed | `restart: no` container | K8s Job | Same script, different runner |
| TLS | None (internal bridge) | TLS everywhere | Local network trust; not a parity issue |
| Replicas | 1 per service | 2-3 per service | Scale test separately with `--scale` |
| Stripe webhooks | stripe-cli forwarding | Direct from Stripe | Functionally identical for dev |

## Startup order

Strict `depends_on` + `condition: service_healthy` enforces:
1. postgres, redis, clickhouse, kafka, nats, minio
2. openmeter, lago-api (+ lago-worker, lago-front)
3. runtime-core, registry, benthos
4. billing-sync, lago-seed (waits for its dependencies)
5. prometheus, grafana
6. stripe-cli

## Testing the billing pipeline end-to-end

```bash
# 1. Emit a test capability.invoked event
curl -X POST http://localhost:8888/api/v1/events \
  -H "Content-Type: application/cloudevents+json" \
  -d '{"specversion":"1.0","id":"test-001","type":"capability.invoked",
       "source":"portals-platform/test","subject":"dev-tenant-001",
       "time":"2025-01-01T00:00:00Z","datacontenttype":"application/json",
       "data":{"capabilityId":"realtime-fanout","sessionId":"sess-001",
               "channelId":"test-ch","durationMs":500}}'

# 2. Verify OpenMeter received and aggregated it
curl http://localhost:8888/api/v1/meters/capability-invocations/query?subject=dev-tenant-001

# 3. Check Lago customer usage (after billing-sync fires)
curl http://localhost:3000/api/v1/customers/dev-tenant-001/current_usage \
  -H "Authorization: Bearer $LAGO_API_KEY"

# 4. Observe in Grafana: http://localhost:3001 (admin/admin)
```
