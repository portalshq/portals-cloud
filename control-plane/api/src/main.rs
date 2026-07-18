use config::AppConfig;
use persistence::PostgresStateStore;
use sqlx::postgres::PgPoolOptions;
use std::sync::Arc;
use tokio::signal;
use tracing::{error, info, warn};
use aws_sdk_sqs::Client as SqsClient;
use aws_config::BehaviorVersion;
use models::Controller;

use api::{auth, http};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config = AppConfig::from_env();
    observability::init_with_log_filter(&config.log_filter)?;

    info!("connecting to database");
    let pool = PgPoolOptions::new()
        .max_connections(20)
        .connect(&config.database_url)
        .await?;

    let store = Arc::new(PostgresStateStore::new(pool));
    store.run_migrations().await?;

    let signing_key = auth::DataPlaneSigningKey::from_env(&config.ed25519_signing_key)?;

    let state = http::AppState {
        store: store.clone(),
        signing_key,
        dp_token_expiry_secs: config.dp_token_expiry_secs,
    };

    // Initialize metrics
    api::metrics::init_metrics();

    // Start outbox relay in background (skip if no event queue configured)
    let outbox_handle = if config.sqs_queue_url.is_empty() && config.event_bridge_endpoint.is_empty() {
        warn!("no event queue configured (SQS_QUEUE_URL / EVENT_BRIDGE_ENDPOINT) — outbox relay disabled, events will be marked published without delivery");
        None
    } else {
        let outbox_store = store.clone();
        let outbox_interval = config.outbox_poll_interval_ms;
        let sqs_url = config.sqs_queue_url.clone();
        let aws_region = config.s3_region.clone();
        
        Some(tokio::spawn(async move {
            let relay = if !sqs_url.is_empty() {
                // Create SQS client for event delivery
                let config = aws_config::defaults(BehaviorVersion::latest())
                    .region(aws_sdk_sqs::config::Region::new(aws_region.clone()))
                    .load()
                    .await;
                let sqs_client = SqsClient::new(&config);
                persistence::OutboxRelay::new(outbox_store, outbox_interval)
                    .with_sqs(sqs_url, sqs_client)
            } else {
                // EventBridge not yet implemented, use basic relay
                persistence::OutboxRelay::new(outbox_store, outbox_interval)
            };
            relay.run().await;
        }))
    };

    // Start reconciler loop in background
    let reconciler_handle = {
        use controllers::repository::{RepositoryController, RepositoryResource};
        use controllers::organization::{OrganizationController, OrganizationResource};
        use models::ResourceKind;

        let repo_store = store.clone();

        // Use real S3 provider if provider_type is "aws", otherwise mock
        let repo_provider: Arc<dyn providers::r#trait::repository::RepositoryProvider> =
            if config.provider_type == "aws" {
                if config.s3_endpoint.is_empty() {
                    error!("PROVIDER_TYPE=aws but S3_ENDPOINT is not configured");
                    return Err(anyhow::anyhow!("PROVIDER_TYPE=aws requires S3_ENDPOINT to be configured"));
                }
                info!(endpoint = %config.s3_endpoint, bucket = %config.s3_bucket_chunks, "using S3 storage provider");
                Arc::new(providers::aws::s3_storage::S3StorageProvider::new(
                    config.s3_endpoint.clone(),
                    config.s3_access_key.clone(),
                    config.s3_secret_key.clone(),
                    config.s3_region.clone(),
                    config.s3_bucket_chunks.clone(),
                    config.s3_force_path_style(),
                ))
            } else if config.provider_type == "mock" {
                warn!("PROVIDER_TYPE=mock — using mock storage provider (data will not be persisted)");
                Arc::new(providers::mock::repository::MockRepositoryProvider::new())
            } else {
                error!("Invalid PROVIDER_TYPE: {} (must be 'aws' or 'mock')", config.provider_type);
                return Err(anyhow::anyhow!("PROVIDER_TYPE must be either 'aws' or 'mock'"));
            };

        let repo_controller = Arc::new(RepositoryController {
            store: repo_store.clone(),
            provider: repo_provider,
        });

        let org_controller = Arc::new(OrganizationController {
            store: repo_store.clone(),
        });

        let loop_store = store.clone();

        // Phase 1: Initialize controllers
        info!("Phase 1: Initializing controllers");

        // Phase 2: Health check gate - verify controllers are healthy
        info!("Phase 2: Running controller health checks");
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await; // Brief initialization delay
        
        repo_controller.health_check().await
            .map_err(|e| anyhow::anyhow!("Repository controller health check failed: {}", e))?;
        info!("Repository controller health check passed");
        
        org_controller.health_check().await
            .map_err(|e| anyhow::anyhow!("Organization controller health check failed: {}", e))?;
        info!("Organization controller health check passed");

        // Phase 3: Start reconciler loops
        info!("Phase 3: Starting reconciler loops");
        
        // Repository reconciler loop
        let repo_reconciler_loop = reconciler::TypedReconcilerLoop::new(
            loop_store.clone(),
            repo_controller,
            ResourceKind::Repository,
            config.reconciler_sweep_interval_ms,
        );

        // Organization reconciler loop
        let org_reconciler_loop = reconciler::TypedReconcilerLoop::new(
            loop_store,
            org_controller,
            ResourceKind::Organization,
            config.reconciler_sweep_interval_ms,
        );

        info!("All controllers started successfully");

        tokio::spawn(async move {
            tokio::select! {
                _ = async {
                    repo_reconciler_loop
                        .run_with_builder(|row| {
                            let spec: providers::r#trait::repository::RepositorySpec =
                                serde_json::from_value(row.spec.clone()).ok()?;
                            Some(Arc::new(RepositoryResource {
                                id: models::ResourceId::new(&row.id),
                                version: row.version as u64,
                                spec,
                                finalizers: row.finalizers.clone(),
                                deletion_requested: row.deletion_requested,
                                owner_refs: vec![],
                            }))
                        })
                        .await;
                } => {}
                _ = async {
                    org_reconciler_loop
                        .run_with_builder(|row| {
                            let spec: controllers::organization::OrganizationSpec =
                                serde_json::from_value(row.spec.clone()).ok()?;
                            Some(Arc::new(OrganizationResource {
                                id: models::ResourceId::new(&row.id),
                                version: row.version as u64,
                                spec,
                                finalizers: row.finalizers.clone(),
                                deletion_requested: row.deletion_requested,
                                owner_refs: vec![],
                            }))
                        })
                        .await;
                } => {}
            }
        })
    };

    let app = http::build_router_with_cors(
        state,
        &config.cors_allowed_origins,
        config.jwt_auth_enabled,
        config.idempotency_enabled,
        if config.redis_url.is_empty() { None } else { Some(&config.redis_url) },
    );

    info!(addr = %config.listen_addr, "starting control plane API");
    let listener = tokio::net::TcpListener::bind(config.listen_addr).await?;
    let server = axum::serve(listener, app);

    // Graceful shutdown on SIGTERM / SIGINT (Ctrl+C)
    let shutdown = async {
        let ctrl_c = async {
            signal::ctrl_c()
                .await
                .expect("failed to install Ctrl+C handler");
        };

        #[cfg(unix)]
        let terminate = async {
            signal::unix::signal(signal::unix::SignalKind::terminate())
                .expect("failed to install SIGTERM handler")
                .recv()
                .await;
        };

        #[cfg(not(unix))]
        let terminate = std::future::pending::<()>();

        tokio::select! {
            _ = ctrl_c => info!("received Ctrl+C, shutting down"),
            _ = terminate => info!("received SIGTERM, shutting down"),
        }
    };

    tokio::select! {
        result = server => {
            if let Err(e) = result {
                error!(error = %e, "server error");
            }
        }
        _ = shutdown => {}
    }

    // Abort background tasks
    reconciler_handle.abort();
    if let Some(handle) = outbox_handle {
        handle.abort();
    }

    info!("control plane shut down");
    Ok(())
}
