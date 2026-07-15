# Lore Cloud Control Plane

An AWS-style control plane for the Lore VCS server. Manages repositories, organizations, and data plane tokens via a Postgres state store with transactional outbox and optimistic concurrency control.

## Quick Start

### Local Development

```bash
# 1. Start infrastructure (Postgres, MinIO, etc.)
docker compose --env-file .env.local up -d postgres minio minio-init

# 2. Run the control plane locally
cd control-plane
cp .env.local .env
cargo +1.97.0-aarch64-apple-darwin run --bin lorecloud-control-plane

# 3. Test the API
curl http://127.0.0.1:8083/healthz
curl http://127.0.0.1:8083/api/v1/repositories
```

### Docker

```bash
docker compose --env-file .env.local up -d control-plane
```

### Full Stack (all services)

```bash
cp .env.compose .env.compose.local   # edit with real values
docker compose --env-file .env.compose.local up -d
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Axum HTTP API                        │
│  /healthz  /readyz  /api/v1/repositories  /api/v1/orgs  │
│  /api/v1/repositories/:id/tokens                       │
│  /api/v1/repositories/:id/import                       │
└────────────────────────┬────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    ┌────▼────┐   ┌──────▼──────┐  ┌─────▼─────┐
    │ Postgres │   │  Reconciler  │  │  Outbox   │
    │  State   │   │    Loop     │  │  Relay    │
    │  Store   │   │  (edge +    │  │ (poll +   │
    │          │   │   level)    │  │  publish) │
    └────┬─────┘   └──────┬──────┘  └─────┬─────┘
         │               │               │
    ┌────▼────────────────▼───────────────▼────┐
    │         Transactional Outbox              │
    │  outbox_events (FOR UPDATE SKIP LOCKED)   │
    └────────────────────┬─────────────────────┘
                         │
                  ┌──────▼──────┐
                  │  SQS / SNS  │
                  │ (future)    │
                  └─────────────┘
```

### Key Design Decisions

- **Optimistic concurrency**: Every resource write checks `version = $expected`. Concurrent modifications return `STALE_VERSION`.
- **Transactional outbox**: Events are written to the `outbox_events` table in the same transaction as state changes. The outbox relay polls and publishes them.
- **Reconciler loop**: Edge-triggered (immediate on change) + level-triggered (periodic sweep). Exponential backoff with jitter on errors.
- **Ed25519 data plane tokens**: JWTs signed with Ed25519 keys. Tokens encode repo_id and permissions for the data plane to validate.
- **Soft-delete with finalizers**: Organizations use a soft-delete pattern with finalizers. Deletion requests mark the resource and the reconciler runs cleanup logic before removal.
- **JWT authentication middleware**: Optional JWT verification on protected API routes using Ed25519-signed tokens.
- **Idempotency keys**: Optional idempotency support via `Idempotency-Key` header for safe request retries.

## API Reference

### Health

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/healthz` | GET | Liveness check |
| `/readyz` | GET | Readiness check (verifies DB connection) |

### Repositories

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/repositories` | GET | List all repositories |
| `/api/v1/repositories` | POST | Create a repository |
| `/api/v1/repositories/:id` | GET | Get a repository |
| `/api/v1/repositories/:id` | PATCH | Update a repository |
| `/api/v1/repositories/:id` | DELETE | Request deletion (soft delete) |

**Create request:**
```json
{
  "name": "my-repo",
  "storage_tier": "standard"
}
```

**Response:**
```json
{
  "id": "repo-550e8400-e29b-41d4-a716-446655440000",
  "name": "my-repo",
  "storage_tier": "standard",
  "status": { "phase": "Pending" },
  "version": 1,
  "created_at": "2026-07-15T12:00:00+00:00",
  "updated_at": "2026-07-15T12:00:00+00:00"
}
```

### Data Plane Tokens

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/repositories/:id/tokens` | POST | Issue an Ed25519-signed JWT |

**Request:**
```json
{
  "subject": "user@example.com",
  "permissions": ["ReadChunks", "WriteChunks"]
}
```

**Response:**
```json
{
  "token": "eyJ...",
  "expires_in": 3600,
  "verifying_key": "base64..."
}
```

### Organizations

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/organizations` | GET | List all organizations |
| `/api/v1/organizations` | POST | Create an organization |
| `/api/v1/organizations/:id` | GET | Get an organization |
| `/api/v1/organizations/:id` | DELETE | Delete an organization (soft delete with finalizer) |

**Note:** Organization deletion uses a soft-delete pattern with a finalizer. The organization is marked for deletion and the reconciler runs cleanup logic before removing it from the database.

### Workflows

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/repositories/:id/import` | POST | Start a repository import workflow |
| `/api/v1/repositories/:id/workflows/:wf_id` | GET | Get workflow status |
| `/api/v1/repositories/:id/workflows/:wf_id` | POST | Advance workflow to next step |

### Events

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/events` | GET | List unpublished outbox events |
| `/api/v1/events/unpublished` | GET | Same as above (alias) |

### Error Responses

All errors return a consistent JSON body:

```json
{
  "error": "resource not found",
  "code": "NOT_FOUND"
}
```

Standard codes: `NOT_FOUND`, `STALE_VERSION`, `VALIDATION_ERROR`, `INTERNAL`.

Every response includes an `X-Request-Id` header for tracing.

## Configuration

All configuration is via environment variables (loaded from `.env` via `dotenvy`):

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | *required* | Postgres connection string |
| `LISTEN_ADDR` | `0.0.0.0:8083` | Bind address |
| `S3_ENDPOINT` | `http://localhost:9002` | S3/MinIO endpoint |
| `S3_ACCESS_KEY` | *required* | S3 access key |
| `S3_SECRET_KEY` | *required* | S3 secret key |
| `ED25519_SIGNING_KEY` | *required* | Base64-encoded 32-byte Ed25519 key |
| `DP_TOKEN_EXPIRY_SECS` | `3600` | Data plane token TTL |
| `OUTBOX_POLL_INTERVAL_MS` | `1000` | Outbox relay poll interval |
| `RECONCILER_SWEEP_INTERVAL_MS` | `5000` | Reconciler sweep interval |
| `CORS_ALLOWED_ORIGINS` | `*` | Comma-separated allowed origins |
| `RUST_LOG` | `info,...` | Tracing filter |
| `METRICS_ENABLED` | `true` | Enable Prometheus metrics endpoint |
| `JWT_AUTH_ENABLED` | `false` | Enable JWT authentication on protected routes |
| `IDEMPOTENCY_ENABLED` | `true` | Enable idempotency key support |
| `REDIS_URL` | `""` | Redis URL for idempotency cache (empty = in-memory) |

**Generate a signing key:**
```bash
openssl rand -base64 32
```

## Testing

```bash
# Unit + integration tests (no external deps required — uses MockStateStore)
cd control-plane
cargo +1.97.0-aarch64-apple-darwin test

# With a live Postgres instance
cargo +1.97.0-aarch64-apple-darwin test -- --ignored
```

## Scripts

| Script | Description |
|--------|-------------|
| `./control-plane/scripts/test.sh` | Run all tests |
| `./control-plane/scripts/build.sh` | Build release binary |
| `./control-plane/scripts/docker-build.sh` | Build Docker image |
| `./control-plane/scripts/generate-key.sh` | Generate Ed25519 signing key |
| `./control-plane/scripts/dev.sh` | Start dev environment and run server |

## Project Structure

```
control-plane/
├── api/              HTTP server, handlers, auth (Ed25519 JWTs)
├── config/           AppConfig (clap + env)
├── controllers/      Domain controllers (Repository reconciler)
├── events/           Platform event types, EventBus trait
├── models/           Shared types (ResourceId, Resource trait, etc.)
├── observability/    Tracing initialization
├── persistence/      Postgres StateStore, migrations, outbox relay
├── providers/        Repository/Secret provider traits + mocks + S3 impl
├── reconciler/       Typed reconciler loop (edge + level triggered)
├── workflows/        WorkflowOrchestrator (multi-step orchestration)
├── tests/            Integration tests
└── scripts/          Dev helper scripts
```

## Database Schema

Three tables (defined in `persistence/migrations/001_init.sql`):

- **`resources`**: Desired/observed state with CAS version, finalizers, deletion markers
- **`outbox_events`**: Transactional outbox with `FOR UPDATE SKIP LOCKED` polling
- **`workflow_steps`**: Step Functions-style workflow state tracking

Migrations run automatically on startup via `include_str!()`.

## Deployment

**Docker:**
```bash
docker build -t lorecloud-control-plane -f docker/control-plane/Dockerfile .
```

**Kubernetes/ECS:** See `infra/pulumi` directory for Pulumi infrastructure as code. The ControlPlaneService component supports the following optional parameters:

- `jwtAuthEnabled`: Enable JWT authentication (default: "false")
- `idempotencyEnabled`: Enable idempotency keys (default: "true")
- `metricsEnabled`: Enable Prometheus metrics (default: "true")
- `imageTag`: Docker image tag (default: "latest")
- `rustLog`: RUST_LOG filter (default: "info")

## Recent Updates

### Phase 4: Soft-Delete Organizations
- Implemented soft-delete pattern for organizations using finalizers
- Organization deletion now marks the resource and runs cleanup logic before removal
- Added `OrganizationController` with `org-cleanup` finalizer
- Migration `002_add_org_finalizers.sql` adds finalizer to existing organizations

### Phase 5: JWT Authentication Middleware
- Added optional JWT authentication middleware for protected API routes
- Configured via `JWT_AUTH_ENABLED` environment variable (default: false)
- Verifies `Authorization: Bearer <token>` header using Ed25519 signing key
- Public routes (`/healthz`, `/readyz`) remain unauthenticated

### Phase 6: Idempotency Keys
- Added idempotency support via `Idempotency-Key` header
- Configured via `IDEMPOTENCY_ENABLED` environment variable (default: true)
- Caches successful responses for safe request retries
- In-memory cache (replace with Redis in production)

### Phase 7: Pulumi Updates
- Updated `ControlPlaneServiceArgs` interface with new configuration options
- Added environment variables for JWT auth, idempotency, and metrics to ECS task definition
- All new features are configurable via Pulumi stack configuration
