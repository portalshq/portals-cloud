use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

pub type Timestamp = DateTime<Utc>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrincipalId(pub String);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PrincipalKind {
    User,
    ServiceAccount,
    InternalController,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditContext {
    pub principal_id: PrincipalId,
    pub principal_kind: PrincipalKind,
    pub session_id: Option<String>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub request_id: String,
    pub timestamp: Timestamp,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AuditEvent {
    ResourceRead { context: AuditContext, kind: String, id: String },
    ResourceCreate { context: AuditContext, kind: String, id: String, spec: serde_json::Value },
    ResourceUpdate { context: AuditContext, kind: String, id: String, patch: serde_json::Value },
    ResourceDelete { context: AuditContext, kind: String, id: String },
    PermissionGranted { context: AuditContext, grantee: PrincipalId, scope: String },
    PermissionRevoked { context: AuditContext, grantee: PrincipalId, scope: String },
    PolicyAttached { context: AuditContext, resource_id: String, policy_id: String },
    SecretAccessed { context: AuditContext, key: String },
    SecretRotated { context: AuditContext, key: String },
    LoginSuccess { context: AuditContext },
    LoginFailed { context: AuditContext, reason: String },
    TokenRevoked { context: AuditContext, token_id: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PlatformEvent {
    RepositoryRequested { id: String, spec: serde_json::Value },
    RepositoryProvisioned { id: String, provisioned_at: Timestamp },
    RepositoryUpdated { id: String, patch: serde_json::Value },
    RepositoryDeleted { id: String },
    RepositoryImportStarted { id: String, workflow_id: String },
    RepositoryImportDone { id: String },
    RepositoryFailed { id: String, reason: String },

    OrganizationCreated { id: String },
    OrganizationDeleted { id: String },

    CapabilityRegistered { id: String, version: String },
    CapabilityDeprecated { id: String, version: String, sunset_at: Timestamp },
    CapabilityDeployed { id: String, target: String },

    QuotaExceeded { resource_kind: String, org_id: String, quota: String },
    BillingAnchored { org_id: String, billing_plan: String },

    SessionScheduled { session_id: String, channel_id: String },
    SessionStarted { session_id: String },
    SessionDrained { session_id: String },
    SessionTerminated { session_id: String },

    ReconcileRequested { kind: String, id: String },
    ReconcileSucceeded { kind: String, id: String, duration_ms: u64 },
    ReconcileFailed { kind: String, id: String, reason: String, retries: u32 },

    ProviderCallSucceeded { resource_id: String, operation: String },
    ProviderCallFailed { resource_id: String, operation: String, error: String },
    CircuitBreakerOpened { provider: String, triggered_at: Timestamp },
    CircuitBreakerClosed { provider: String, recovered_at: Timestamp },
}
