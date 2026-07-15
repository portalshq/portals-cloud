pub mod handlers;

use axum::{
    extract::Request,
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Router,
};
use axum_prometheus::PrometheusMetricLayer;
use tower_http::cors::{AllowHeaders, Any, CorsLayer};
use tower_http::trace::TraceLayer;
use uuid::Uuid;

use crate::auth::{DataPlaneSigningKey, idempotency::create_idempotency_cache, middleware::jwt_auth_middleware};
use persistence::PostgresStateStore;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub store: Arc<PostgresStateStore>,
    pub signing_key: DataPlaneSigningKey,
    pub dp_token_expiry_secs: u64,
}

// ── Request ID middleware ───────────────────────────────────────────────────
// Attaches a unique X-Request-Id header to every request and response.

async fn request_id_middleware(request: Request, next: Next) -> Response {
    let request_id = Uuid::new_v4().to_string();
    let mut response = next.run(request).await;
    use axum::http::header::HeaderName;
    response.headers_mut().insert(
        HeaderName::from_static("x-request-id"),
        request_id.parse().expect("valid header value"),
    );
    response
}

// ── 404 fallback ────────────────────────────────────────────────────────────

async fn not_found() -> axum::response::Response {
    (
        axum::http::StatusCode::NOT_FOUND,
        axum::Json(serde_json::json!({
            "error": "not found",
            "code": "NOT_FOUND"
        })),
    )
        .into_response()
}

// ── Router builder ──────────────────────────────────────────────────────────

pub fn build_router(state: AppState, jwt_enabled: bool, idempotency_enabled: bool, redis_url: Option<&str>) -> Router {
    build_router_with_cors(state, "*", jwt_enabled, idempotency_enabled, redis_url)
}

pub fn build_router_with_cors(state: AppState, cors_origins: &str, jwt_enabled: bool, idempotency_enabled: bool, redis_url: Option<&str>) -> Router {
    let cors = if cors_origins == "*" {
        CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any)
    } else {
        let origins: Vec<axum::http::HeaderValue> = cors_origins
            .split(',')
            .filter_map(|s| s.trim().parse().ok())
            .collect();
        CorsLayer::new()
            .allow_origin(origins)
            .allow_methods(Any)
            .allow_headers(AllowHeaders::any())
    };

    let (prometheus_layer, _) = PrometheusMetricLayer::pair();

    // Initialize custom metrics
    crate::metrics::init_metrics();

    // Create idempotency cache if enabled
    let idempotency_cache = if idempotency_enabled {
        Some(create_idempotency_cache(redis_url))
    } else {
        None
    };

    // Public routes (no auth required)
    let public_routes = Router::new()
        .route("/healthz", get(handlers::healthz))
        .route("/readyz", get(handlers::readyz));

    // Protected routes
    let protected_routes = Router::new()
        .route(
            "/api/v1/repositories",
            get(handlers::list_repositories)
                .post(handlers::create_repository),
        )
        .route(
            "/api/v1/repositories/:id",
            get(handlers::get_repository)
                .patch(handlers::update_repository)
                .delete(handlers::delete_repository),
        )
        .route(
            "/api/v1/repositories/:id/tokens",
            post(handlers::issue_data_plane_token),
        )
        .route(
            "/api/v1/repositories/:id/import",
            post(handlers::start_repository_import),
        )
        .route(
            "/api/v1/repositories/:id/workflows/:workflow_id",
            get(handlers::get_workflow_status)
                .post(handlers::advance_workflow),
        )
        .route(
            "/api/v1/organizations",
            get(handlers::list_organizations)
                .post(handlers::create_organization),
        )
        .route(
            "/api/v1/organizations/:id",
            get(handlers::get_organization)
                .delete(handlers::delete_organization),
        )
        .route(
            "/api/v1/events",
            get(handlers::list_events),
        )
        .route(
            "/api/v1/events/unpublished",
            get(handlers::list_unpublished_events),
        );

    // Apply JWT auth middleware if enabled
    let protected_routes = if jwt_enabled {
        let signing_key = state.signing_key.clone();
        protected_routes.layer(middleware::from_fn(move |request, next| {
            let signing_key = signing_key.clone();
            async move {
                jwt_auth_middleware(signing_key, request, next).await
            }
        }))
    } else {
        protected_routes
    };

    // Apply idempotency middleware if enabled
    let protected_routes = if let Some(cache) = idempotency_cache {
        protected_routes.layer(middleware::from_fn(move |request, next| {
            let cache = cache.clone();
            async move {
                crate::auth::idempotency::idempotency_middleware(cache, request, next).await
            }
        }))
    } else {
        protected_routes
    };

    // Combine routes
    public_routes
        .merge(protected_routes)
        .fallback(not_found)
        .layer(prometheus_layer)
        .layer(middleware::from_fn(request_id_middleware))
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .with_state(state)
}
