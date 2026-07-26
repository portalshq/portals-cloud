use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::Utc;
use models::{ResourceId, ResourceKind};
use persistence::state_store::StateStore;
use providers::r#trait::repository::RepositorySpec;
use serde::{Deserialize, Serialize};
use tracing::{error, info};

use crate::http::AppState;

// ============================================================
// Consistent API error type
// ============================================================

#[derive(Debug, Serialize)]
pub struct ApiError {
    pub error: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
}

impl ApiError {
    pub fn new(status: StatusCode, message: impl Into<String>) -> (StatusCode, Json<ApiError>) {
        (
            status,
            Json(ApiError {
                error: message.into(),
                code: None,
            }),
        )
    }

    pub fn with_code(
        status: StatusCode,
        code: impl Into<String>,
        message: impl Into<String>,
    ) -> (StatusCode, Json<ApiError>) {
        (
            status,
            Json(ApiError {
                error: message.into(),
                code: Some(code.into()),
            }),
        )
    }
}

impl From<persistence::state_store::StoreError> for ApiError {
    fn from(e: persistence::state_store::StoreError) -> Self {
        match e {
            persistence::state_store::StoreError::NotFound => ApiError {
                error: "resource not found".to_string(),
                code: Some("NOT_FOUND".to_string()),
            },
            persistence::state_store::StoreError::StaleVersion => ApiError {
                error: "concurrent modification detected, retry".to_string(),
                code: Some("STALE_VERSION".to_string()),
            },
            persistence::state_store::StoreError::Database(msg) => ApiError {
                error: format!("internal error: {msg}"),
                code: Some("INTERNAL".to_string()),
            },
        }
    }
}

type ApiResult<T> = Result<T, (StatusCode, Json<ApiError>)>;

// ============================================================
// Health & Readiness
// ============================================================

pub async fn healthz() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok" }))
}

pub async fn readyz(State(state): State<AppState>) -> ApiResult<Json<serde_json::Value>> {
    state.store.ping().await.map_err(|e| {
        error!(error = %e, "readiness check failed");
        ApiError::new(StatusCode::SERVICE_UNAVAILABLE, "database not ready")
    })?;
    Ok(Json(serde_json::json!({ "status": "ready" })))
}

// ============================================================
// Repository CRUD
// ============================================================

#[derive(Deserialize)]
pub struct CreateRepositoryRequest {
    pub name: String,
    pub storage_tier: Option<String>,
    pub organization: Option<String>,
}

#[derive(Serialize)]
pub struct RepositoryResponse {
    pub id: String,
    pub name: String,
    pub storage_tier: String,
    pub status: serde_json::Value,
    pub version: u64,
    pub created_at: String,
    pub updated_at: String,
}

pub async fn create_repository(
    State(state): State<AppState>,
    Json(req): Json<CreateRepositoryRequest>,
) -> ApiResult<(StatusCode, Json<RepositoryResponse>)> {
    if req.name.is_empty() {
        return Err(ApiError::with_code(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "name is required",
        ));
    }

    let id = ResourceId::new(format!("repo-{}", uuid::Uuid::new_v4()));
    let storage_tier = req.storage_tier.unwrap_or_else(|| "standard".to_string());

    let spec = RepositorySpec {
        name: req.name.clone(),
        storage_tier: storage_tier.clone(),
    };

    let spec_value = serde_json::to_value(&spec).map_err(|e| {
        error!(error = %e, "failed to serialize repository spec");
        ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to serialize repository spec")
    })?;

    state
        .store
        .create_resource(
            ResourceKind::Repository.as_str(),
            &id,
            &spec_value,
            &["lorecloud.io/repository-cleanup".to_string()],
        )
        .await
        .map_err(|e| {
            error!(error = %e, "failed to create repository");
            ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to create repository")
        })?;

    info!(id = %id.as_str(), name = %req.name, "repository created");

    let now = Utc::now().to_rfc3339();
    Ok((
        StatusCode::CREATED,
        Json(RepositoryResponse {
            id: id.0,
            name: req.name,
            storage_tier,
            status: serde_json::json!({ "phase": "Pending" }),
            version: 1,
            created_at: now.clone(),
            updated_at: now,
        }),
    ))
}

pub async fn get_repository(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<RepositoryResponse>> {
    let resource_id = ResourceId::new(id);

    let row = state
        .store
        .get_resource_raw(ResourceKind::Repository.as_str(), &resource_id)
        .await
        .map_err(|e| {
            error!(error = %e, "failed to get repository");
            ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to fetch repository")
        })?
        .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "repository not found"))?;

    let spec: RepositorySpec = serde_json::from_value(row.spec).unwrap_or(RepositorySpec {
        name: "unknown".to_string(),
        storage_tier: "standard".to_string(),
    });

    Ok(Json(RepositoryResponse {
        id: row.id,
        name: spec.name,
        storage_tier: spec.storage_tier,
        status: row.status,
        version: row.version as u64,
        created_at: row.created_at.to_rfc3339(),
        updated_at: row.updated_at.to_rfc3339(),
    }))
}

pub async fn list_repositories(
    State(state): State<AppState>,
) -> ApiResult<Json<Vec<RepositoryResponse>>> {
    let rows = state
        .store
        .list_resources(ResourceKind::Repository.as_str())
        .await
        .map_err(|e| {
            error!(error = %e, "failed to list repositories");
            ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to list repositories")
        })?;

    let repos: Vec<RepositoryResponse> = rows
        .into_iter()
        .map(|row| {
            let spec: RepositorySpec = serde_json::from_value(row.spec).unwrap_or(RepositorySpec {
                name: "unknown".to_string(),
                storage_tier: "standard".to_string(),
            });
            RepositoryResponse {
                id: row.id,
                name: spec.name,
                storage_tier: spec.storage_tier,
                status: row.status,
                version: row.version as u64,
                created_at: row.created_at.to_rfc3339(),
                updated_at: row.updated_at.to_rfc3339(),
            }
        })
        .collect();

    Ok(Json(repos))
}

#[derive(Deserialize)]
pub struct UpdateRepositoryRequest {
    pub name: Option<String>,
    pub storage_tier: Option<String>,
}

pub async fn update_repository(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<UpdateRepositoryRequest>,
) -> ApiResult<Json<RepositoryResponse>> {
    let resource_id = ResourceId::new(id);

    let row = state
        .store
        .get_resource_raw(ResourceKind::Repository.as_str(), &resource_id)
        .await
        .map_err(|e| {
            error!(error = %e, "failed to get repository for update");
            ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to fetch repository")
        })?
        .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "repository not found"))?;

    let mut spec: RepositorySpec =
        serde_json::from_value(row.spec).unwrap_or(RepositorySpec {
            name: "unknown".to_string(),
            storage_tier: "standard".to_string(),
        });

    if let Some(name) = req.name {
        if name.is_empty() {
            return Err(ApiError::with_code(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "name cannot be empty",
            ));
        }
        spec.name = name;
    }
    if let Some(tier) = req.storage_tier {
        spec.storage_tier = tier;
    }

    let spec_value = serde_json::to_value(&spec).map_err(|e| {
        error!(error = %e, "failed to serialize repository spec");
        ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to serialize repository spec")
    })?;
    state
        .store
        .update_spec(
            ResourceKind::Repository.as_str(),
            &resource_id,
            &spec_value,
        )
        .await
        .map_err(|e| {
            error!(error = %e, "failed to update repository");
            ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to update repository")
        })?;

    Ok(Json(RepositoryResponse {
        id: resource_id.0,
        name: spec.name,
        storage_tier: spec.storage_tier,
        status: row.status,
        version: (row.version + 1) as u64,
        created_at: row.created_at.to_rfc3339(),
        updated_at: Utc::now().to_rfc3339(),
    }))
}

pub async fn delete_repository(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    let resource_id = ResourceId::new(id);

    state
        .store
        .mark_deletion_requested(&resource_id)
        .await
        .map_err(|e| {
            error!(error = %e, "failed to delete repository");
            ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to delete repository")
        })?;

    info!(id = %resource_id.as_str(), "repository deletion requested");
    Ok(StatusCode::ACCEPTED)
}

// ============================================================
// Data Plane Token Issuance
// ============================================================

#[derive(Deserialize)]
pub struct IssueTokenRequest {
    pub subject: String,
    pub permissions: Option<Vec<String>>,
}

#[derive(Serialize)]
pub struct IssueTokenResponse {
    pub token: String,
    pub expires_in: u64,
    pub verifying_key: String,
}

pub async fn issue_data_plane_token(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<IssueTokenRequest>,
) -> ApiResult<Json<IssueTokenResponse>> {
    let resource_id = ResourceId::new(&id);

    let exists = state
        .store
        .exists(ResourceKind::Repository, &resource_id)
        .await
        .map_err(|e| {
            error!(error = %e, "failed to check repository existence");
            ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to verify repository")
        })?;

    if !exists {
        return Err(ApiError::new(
            StatusCode::NOT_FOUND,
            "repository not found",
        ));
    }

    let permissions = req
        .permissions
        .unwrap_or_else(|| vec!["ReadChunks".to_string(), "WriteChunks".to_string()]);

    let token = state
        .signing_key
        .issue_data_plane_token(
            &req.subject,
            &id,
            permissions,
            state.dp_token_expiry_secs,
        )
        .map_err(|e| {
            error!(error = %e, "failed to issue token");
            ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to issue token")
        })?;

    let verifying_key = base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        state.signing_key.verifying_key().to_bytes(),
    );

    info!(repo_id = %id, subject = %req.subject, "data plane token issued");

    Ok(Json(IssueTokenResponse {
        token,
        expires_in: state.dp_token_expiry_secs,
        verifying_key,
    }))
}

// ============================================================
// Repository Import
// ============================================================

#[derive(Deserialize)]
pub struct StartImportRequest {
    pub source_url: String,
}

#[derive(Serialize)]
pub struct ImportResponse {
    pub workflow_id: String,
    pub status: String,
}

pub async fn start_repository_import(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<StartImportRequest>,
) -> ApiResult<(StatusCode, Json<ImportResponse>)> {
    if req.source_url.is_empty() {
        return Err(ApiError::with_code(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "source_url is required",
        ));
    }

    let orchestrator = workflows::WorkflowOrchestrator::new(state.store.clone());

    let workflow_id = orchestrator
        .start_repository_import(&id, &req.source_url)
        .await
        .map_err(|e| {
            error!(error = %e, "failed to start import");
            ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to start import")
        })?;

    info!(repo_id = %id, workflow_id = %workflow_id, "import started");

    Ok((
        StatusCode::ACCEPTED,
        Json(ImportResponse {
            workflow_id,
            status: "Running".to_string(),
        }),
    ))
}

// ============================================================
// Workflow Status
// ============================================================

#[derive(Serialize)]
pub struct WorkflowStatusResponse {
    pub workflow_id: String,
    pub state: String,
    pub current_step: usize,
    pub steps: Vec<serde_json::Value>,
}

pub async fn get_workflow_status(
    State(state): State<AppState>,
    Path((_repo_id, workflow_id)): Path<(String, String)>,
) -> ApiResult<Json<WorkflowStatusResponse>> {
    let row = state
        .store
        .get_resource_raw("Workflow", &ResourceId::new(&workflow_id))
        .await
        .map_err(|e| {
            error!(error = %e, "failed to get workflow");
            ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to fetch workflow")
        })?
        .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "workflow not found"))?;

    let current_step = row
        .spec
        .get("current_step")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as usize;

    let state_str = row
        .spec
        .get("state")
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown")
        .to_string();

    let steps = row
        .spec
        .get("steps")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    Ok(Json(WorkflowStatusResponse {
        workflow_id,
        state: state_str,
        current_step,
        steps,
    }))
}

pub async fn advance_workflow(
    State(state): State<AppState>,
    Path((_repo_id, workflow_id)): Path<(String, String)>,
) -> ApiResult<Json<WorkflowStatusResponse>> {
    let orchestrator = workflows::WorkflowOrchestrator::new(state.store.clone());

    let new_state = orchestrator
        .advance_workflow(&workflow_id)
        .await
        .map_err(|e| {
            error!(error = %e, "failed to advance workflow");
            ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to advance workflow")
        })?;

    let row = state
        .store
        .get_resource_raw("Workflow", &ResourceId::new(&workflow_id))
        .await
        .map_err(|e| {
            error!(error = %e, "failed to re-read workflow");
            ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to fetch workflow")
        })?
        .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "workflow not found"))?;

    let current_step = row
        .spec
        .get("current_step")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as usize;

    let steps = row
        .spec
        .get("steps")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    Ok(Json(WorkflowStatusResponse {
        workflow_id,
        state: format!("{:?}", new_state),
        current_step,
        steps,
    }))
}

// ============================================================
// Organization CRUD
// ============================================================

#[derive(Deserialize)]
pub struct CreateOrganizationRequest {
    pub name: String,
    pub slug: String,
}

#[derive(Serialize)]
pub struct OrganizationResponse {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub created_at: String,
}

pub async fn create_organization(
    State(state): State<AppState>,
    Json(req): Json<CreateOrganizationRequest>,
) -> ApiResult<(StatusCode, Json<OrganizationResponse>)> {
    if req.name.is_empty() || req.slug.is_empty() {
        return Err(ApiError::with_code(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "name and slug are required",
        ));
    }

    let id = ResourceId::new(format!("org-{}", uuid::Uuid::new_v4()));
    let spec = serde_json::json!({
        "name": req.name,
        "slug": req.slug,
    });

    state
        .store
        .create_resource(ResourceKind::Organization.as_str(), &id, &spec, &[])
        .await
        .map_err(|e| {
            error!(error = %e, "failed to create organization");
            ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to create organization")
        })?;

    info!(id = %id.as_str(), name = %req.name, "organization created");
    let now = Utc::now().to_rfc3339();
    Ok((
        StatusCode::CREATED,
        Json(OrganizationResponse {
            id: id.0,
            name: req.name,
            slug: req.slug,
            created_at: now,
        }),
    ))
}

pub async fn get_organization(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<OrganizationResponse>> {
    let row = state
        .store
        .get_resource_raw(ResourceKind::Organization.as_str(), &ResourceId::new(&id))
        .await
        .map_err(|e| {
            error!(error = %e, "failed to get organization");
            ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to fetch organization")
        })?
        .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "organization not found"))?;

    Ok(Json(OrganizationResponse {
        id: row.id,
        name: row.spec.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        slug: row.spec.get("slug").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        created_at: row.created_at.to_rfc3339(),
    }))
}

pub async fn list_organizations(
    State(state): State<AppState>,
) -> ApiResult<Json<Vec<OrganizationResponse>>> {
    let rows = state
        .store
        .list_resources(ResourceKind::Organization.as_str())
        .await
        .map_err(|e| {
            error!(error = %e, "failed to list organizations");
            ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to list organizations")
        })?;

    let orgs: Vec<OrganizationResponse> = rows
        .into_iter()
        .map(|row| OrganizationResponse {
            id: row.id,
            name: row.spec.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            slug: row.spec.get("slug").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            created_at: row.created_at.to_rfc3339(),
        })
        .collect();

    Ok(Json(orgs))
}

pub async fn delete_organization(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    let resource_id = ResourceId::new(id);

    state
        .store
        .mark_deletion_requested(&resource_id)
        .await
        .map_err(|e| {
            error!(error = %e, "failed to delete organization");
            ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to delete organization")
        })?;

    info!(id = %resource_id.as_str(), "organization deletion requested");
    Ok(StatusCode::ACCEPTED)
}

// ============================================================
// Events
// ============================================================

#[derive(Serialize)]
pub struct EventResponse {
    pub seq: i64,
    pub event_type: String,
    pub partition_key: String,
    pub payload: serde_json::Value,
    pub created_at: String,
    pub published: bool,
}

pub async fn list_events(
    State(state): State<AppState>,
) -> ApiResult<Json<Vec<EventResponse>>> {
    let events = state
        .store
        .poll_unpublished_events(100)
        .await
        .map_err(|e| {
            error!(error = %e, "failed to list events");
            ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to list events")
        })?;

    let responses: Vec<EventResponse> = events
        .into_iter()
        .map(|e| EventResponse {
            seq: e.seq,
            event_type: e.event_type,
            partition_key: e.partition_key,
            payload: e.payload,
            created_at: e.created_at.to_rfc3339(),
            published: false,
        })
        .collect();

    Ok(Json(responses))
}

pub async fn list_unpublished_events(
    State(state): State<AppState>,
) -> ApiResult<Json<Vec<EventResponse>>> {
    list_events(State(state)).await
}
