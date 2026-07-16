//! Control Plane HTTP Server
//!
//! This is the main entry point for the control-plane service, exposing
//! the Smithy-defined API via HTTP using axum.

use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tracing::{info, error};
// use tracing_subscriber;

use config::AppConfig;
use observability::Telemetry;

/// Application state
#[derive(Clone)]
struct AppState {
    config: Arc<AppConfig>,
}

/// Health check response
#[derive(Serialize)]
struct HealthResponse {
    status: String,
    version: String,
}

/// Error response
#[derive(Serialize)]
struct ErrorResponse {
    error: String,
    message: String,
}

/// Create the application router
fn create_router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health_check))
        .route("/api/v1/resources", post(create_resource))
        .route("/api/v1/resources/:kind/:id", get(get_resource))
        .route("/api/v1/resources/:kind", get(list_resources))
        .route("/api/v1/resources/:kind/:id", axum::routing::delete(delete_resource))
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .with_state(state)
}

/// Health check endpoint
async fn health_check(State(_state): State<AppState>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "healthy".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

/// Create resource endpoint
async fn create_resource(
    State(_state): State<AppState>,
    Json(_payload): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    // TODO: Implement resource creation logic
    Ok(Json(serde_json::json!({
        "id": "new-resource-id",
        "status": "created"
    })))
}

/// Get resource endpoint
async fn get_resource(
    State(_state): State<AppState>,
    axum::extract::Path((kind, id)): axum::extract::Path<(String, String)>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    // TODO: Implement resource retrieval logic
    Ok(Json(serde_json::json!({
        "id": id,
        "kind": kind,
        "status": "found"
    })))
}

/// List resources endpoint
async fn list_resources(
    State(_state): State<AppState>,
    axum::extract::Path(kind): axum::extract::Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    // TODO: Implement resource listing logic
    Ok(Json(serde_json::json!({
        "kind": kind,
        "resources": []
    })))
}

/// Delete resource endpoint
async fn delete_resource(
    State(_state): State<AppState>,
    axum::extract::Path((kind, id)): axum::extract::Path<(String, String)>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    // TODO: Implement resource deletion logic
    Ok(StatusCode::NO_CONTENT)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Load configuration
    let config = AppConfig::from_env();
    let config = Arc::new(config);

    // Initialize telemetry
    let obs_config = observability::ObservabilityConfig {
        otlp_endpoint: "http://localhost:4317".to_string(),
        service_name: "control-plane".to_string(),
        environment: "dev".to_string(),
    };
    let _telemetry = Telemetry::init("control-plane", &obs_config)?;
    
    // Initialize tracing subscriber
    // tracing_subscriber::fmt()
    //     .with_target(false)
    //     .compact()
    //     .init();

    info!("Starting control-plane server v{}", env!("CARGO_PKG_VERSION"));

    // Create application state
    let state = AppState {
        config: config.clone(),
    };

    // Create router
    let app = create_router(state);

    // Get server address
    let addr = config.listen_addr;
    let listener = tokio::net::TcpListener::bind(addr).await?;
    info!("Listening on {}", addr);

    // Start server with graceful shutdown
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    info!("Shutdown complete");
    Ok(())
}

/// Graceful shutdown signal handler
async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}
