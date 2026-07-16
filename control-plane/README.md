# Lore Cloud Control Plane

An AWS-style control plane for Portals Cloud & Lore VCS server. implementing a Kubernetes-style controller architecture for managing repositories, organizations, and data plane tokens via a Postgres state store with transactional outbox and optimistic concurrency control.

## Architecture Overview

The control plane follows a declarative resource management pattern inspired by Kubernetes controllers. It manages the lifecycle of infrastructure resources through reconciliation loops, ensuring desired state matches actual state.

### Core Components

- **Controllers**: Reconcile resource state with desired specifications
- **Providers**: Abstract cloud provider implementations (AWS, Mock)
- **Event Bus**: Publish/subscribe for platform events with acknowledgment
- **State Store**: Versioned persistence with transactional outbox
- **Circuit Breaker**: Fault tolerance wrapper for provider calls
- **Configuration**: Layered configuration (defaults, file, environment, runtime)
- **Observability**: OpenTelemetry integration for logs, metrics, traces
- **Workflows**: Long-running workflow execution with orphan cleanup

## Crate Structure

```
control-plane/
├── Cargo.toml                    # Workspace manifest
├── reconciler/                   # Core controller traits and loop
│   ├── src/lib.rs               # Controller, Resource traits
│   └── src/loop.rs              # ReconcileLoop with graceful shutdown
├── providers/                    # Provider implementations
│   ├── trait/                   # Provider trait definitions
│   │   ├── src/lib.rs           # All provider traits
│   │   └── src/circuit_breaker.rs # CircuitBreaker wrapper
│   ├── aws/                     # AWS SDK implementations
│   │   ├── src/lib.rs
│   │   ├── src/repository.rs
│   │   ├── src/storage.rs
│   │   ├── src/compute.rs
│   │   ├── src/identity.rs
│   │   ├── src/networking.rs
│   │   ├── src/secret.rs
│   │   └── src/circuit_breaker.rs
│   └── mock/                    # In-memory mock for testing
│       └── src/lib.rs
├── controllers/                  # Controller implementations
│   ├── organization/            # Phase 1: Organization lifecycle
│   ├── permissions/             # Phase 1: ACL and policy management
│   ├── audit/                   # Phase 1: Audit logging
│   ├── repository/              # Phase 2: Repository provisioning
│   ├── storage/                 # Phase 2: Storage allocation
│   ├── billing/                 # Phase 2: Billing anchors
│   ├── quota/                   # Phase 2: Quota enforcement
│   ├── gc/                      # Phase 2: Garbage collection
│   ├── channel/                 # Phase 3: Channel composition
│   ├── world/                   # Phase 3: World state management
│   ├── session/                 # Phase 3: Session lifecycle
│   ├── capability-deployment/   # Phase 3: Capability deployment
│   ├── resolver/                # Phase 3: NAP address resolution
│   ├── audience-session/        # Phase 3: Audience session binding
│   └── runtime-scheduling/      # Phase 3: Compute scheduling
├── events/                       # Event bus implementation
│   └── src/lib.rs               # EventBus trait, PlatformEvent enum
├── persistence/                  # State store implementation
│   └── src/lib.rs               # StateStore trait, versioned writes
├── config/                       # Configuration management
│   ├── src/lib.rs               # Config loading
│   └── src/defaults.toml        # Default values
├── observability/                # OpenTelemetry integration
│   └── src/lib.rs               # Telemetry initialization
├── workflows/                    # Workflow execution engine
│   └── src/lib.rs               # WorkflowRunner with orphan cleanup
├── api/                          # API definitions
│   └── smithy/                  # Smithy IDL models
│       ├── lorecloud.smithy     # Core API
│       ├── events.smithy        # Event definitions
│       └── README.md
└── tests/                        # Test suite
    ├── src/unit/                # Unit tests
    ├── src/integration/         # Integration tests
    ├── src/contract/            # Contract tests
    ├── src/e2e/                 # End-to-end tests
    └── src/common/              # Test utilities
```

## Controller Phases

Controllers are organized into phases based on startup dependencies:

### Phase 1 (Foundation)
- **Organization**: Manages organization lifecycle and identity namespace
- **Permissions**: Manages ACL records, policy attachments, token scopes
- **Audit**: Manages audit log retention and access log aggregation

### Phase 2 (Resource Management)
- **Repository**: Manages repository provisioning with finalizer-safe deletion
- **Storage**: Manages storage bucket provisioning and quota enforcement
- **Billing**: Manages billing anchors and usage metering
- **Quota**: Enforces API rate limits, concurrent session limits, capability quotas
- **GC**: Owner-reference validation and orphan cleanup

### Phase 3 (Entertainment Platform - Horizon B)
- **Channel**: Manages channel declaration and capability composition graph
- **World**: Manages world state store provisioning and schema migration
- **Session**: Manages session lifecycle (scheduling, start, drain, terminate)
- **CapabilityDeployment**: Manages capability runtime artifact deployment
- **NAPResolver**: Manages NAP address → resource binding
- **AudienceSession**: Manages per-session audience context and identity binding
- **RuntimeScheduling**: Manages compute allocation for active sessions

## Key Design Patterns

### Reconciliation Semantics

- **Optimistic Concurrency Control**: Resources have a version field that must match on updates
- **Finalizers**: Controllers register finalizers to ensure cleanup before deletion
- **Transactional Outbox**: Events are enqueued atomically with state updates
- **Error Policies**: Configurable backoff strategies for transient failures

### Circuit Breaker

Provider calls are wrapped with a circuit breaker to prevent cascading failures:

- **Closed**: Normal operation, tracking failure rate
- **Open**: After failure threshold, reject calls for a duration
- **Half-Open**: Allow limited calls to test recovery

### Configuration Hierarchy

Configuration is loaded from multiple sources in priority order:

1. Defaults (hardcoded)
2. Config file (TOML)
3. Environment variables
4. Runtime overrides

### Event Bus

The event bus provides:

- **Publish/Subscribe**: Decoupled event delivery
- **Acknowledgment**: At-least-once delivery semantics
- **Replay**: Replay events from a given position
- **Dead-Letter Queue**: Failed events for inspection

## Getting Started

### Prerequisites

- Rust 1.70 or later
- Cargo
- (Optional) AWS credentials for AWS provider

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

### Running Tests

```bash
# Unit tests
cargo test --package control-plane-tests --lib unit

# Integration tests
cargo test --package control-plane-tests --lib integration

# Contract tests
cargo test --package control-plane-tests --lib contract

# E2E tests (requires AWS credentials)
cargo test --package control-plane-tests --lib e2e --features e2e
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

### Configuration

Create a configuration file or set environment variables:

```toml
[server]
port = 8080
host = "0.0.0.0"

[log]
level = "info"

[provider]
type = "mock"  # or "aws"

[aws]
region = "us-east-1"
```

Environment variables override config file:

```bash
export CONTROL_PLANE_PORT=9090
export CONTROL_PLANE_LOG_LEVEL=debug
export CONTROL_PLANE_PROVIDER_TYPE=aws
export AWS_REGION=us-west-2
```

## Usage Example

### Creating a Controller

```rust
use std::sync::Arc;
use reconciler::{Controller, Resource, ReconcileContext, ReconcileResult};
use persistence::StateStore;
use events::EventBus;

struct MyController {
    store: Arc<dyn StateStore>,
    event_bus: Arc<dyn EventBus>,
}

#[async_trait::async_trait]
impl Controller for MyController {
    type Resource = MyResource;
    type Error = MyError;

    async fn reconcile(
        &self,
        resource: Arc<Self::Resource>,
        ctx: ReconcileContext,
    ) -> Result<ReconcileResult, Self::Error> {
        // Implement reconciliation logic
        Ok(ReconcileResult::Ok)
    }

    fn error_policy(&self, resource: Arc<Self::Resource>, error: &Self::Error, ctx: ReconcileContext) -> ErrorPolicy {
        // Define error handling strategy
        ErrorPolicy::Backoff { /* ... */ }
    }

    fn finalizers(&self) -> &[&'static str] {
        &["myapp.io/resource-cleanup"]
    }

    async fn health_check(&self) -> Result<(), HealthError> {
        // Health check implementation
        Ok(())
    }
}
```

### Using Providers

```rust
use control_plane_aws_provider::create_aws_provider;
use control_plane_provider_trait::InfrastructureProvider;
use aws_config::Region;

let metrics = Arc::new(ControllerMetrics::new("myapp".to_string()));
let circuit_config = CircuitBreakerConfig::default();

let provider = create_aws_provider(
    Region::new("us-east-1"),
    metrics,
    circuit_config,
).await?;

// Use provider
let spec = RepositorySpec {
    name: "my-repo".to_string(),
    storage_class: "standard".to_string(),
    region: "us-east-1".to_string(),
    tags: vec![],
};

let handle = provider.repository.provision(&spec).await?;
```

### Running a Reconcile Loop

```rust
use reconciler::ReconcileLoop;
use tokio::sync::mpsc;

let controller = Arc::new(MyController::new(store, event_bus));
let (work_tx, work_rx) = mpsc::channel(100);
let (shutdown_tx, shutdown_rx) = oneshot::channel();

let loop_handle = ReconcileLoop::new(
    controller,
    work_rx,
    shutdown_rx,
    metrics,
).run();

// Submit work
work_tx.send(resource).await?;

// Shutdown
shutdown_tx.send(()).await?;
loop_handle.await?;
```

## Development

### Adding a New Controller

1. Create a new crate under `controllers/`
2. Implement the `Controller` trait
3. Define the resource type and phases
4. Add the controller to the workspace `Cargo.toml`
5. Add tests in `tests/src/`

### Adding a New Provider

1. Implement the provider traits in `providers/aws/` or `providers/mock/`
2. Wrap with circuit breaker
3. Add contract tests in `tests/src/contract/`

### Adding a New Resource Type

1. Add to `ResourceKind` enum in `reconciler/src/lib.rs`
2. Add Smithy model in `api/smithy/lorecloud.smithy`
3. Implement controller
4. Add events to `api/smithy/events.smithy`

## Observability

The control plane uses OpenTelemetry for observability:

- **Logs**: Structured logging with tracing
- **Metrics**: Prometheus metrics via `ControllerMetrics`
- **Traces**: Distributed tracing for request flow

Initialize telemetry:

```rust
use observability::Telemetry;

let telemetry = Telemetry::new("control-plane".to_string());
telemetry.init_logging(&config.log.level);
telemetry.init_metrics();
telemetry.init_tracing("http://localhost:4317").await?;
```

## Infrastructure Integration

The control plane integrates with the existing Pulumi infrastructure in `cloud/infra/pulumi`:

### StateStore Integration
- **Database**: Shares Aurora PostgreSQL (PlatformDataStore) with existing platform services
- **Migrations**: Uses sqlx migrations in `persistence/migrations/`
- **Schema**: Tables for resources, events (outbox), dead-letter queue, and workflows
- **Security**: Control-plane security group granted access to PostgreSQL
- **Implementation**: `PostgresStateStore` in `persistence/src/postgres.rs`

### EventBus Integration
- **Service**: AWS SQS with dead-letter queue (PlatformEventBus component)
- **Implementation**: `SqsEventBus` in `events/src/sqs.rs`
- **Features**: At-least-once delivery, acknowledgment, DLQ for failed events
- **IAM**: Task execution role has SQS permissions via attached policy

### Service Deployment
- **Component**: ControlPlaneService in `cloud/infra/pulumi/src/components/`
- **Platform**: ECS Fargate in existing PlatformCluster
- **Image**: Built and pushed to dedicated ECR repository
- **Environment**: DATABASE_URL, EVENT_QUEUE_URL, DEAD_LETTER_QUEUE_URL, AWS_REGION

### Local Development
- **Docker Compose**: PostgreSQL + ElasticMQ (SQS-compatible) + Control Plane
- **Parity**: Local setup matches production infrastructure
- **Migrations**: Run via `scripts/migrate.sh`
- **Configuration**: Environment variables override defaults


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
