use async_trait::async_trait;
use std::time::Duration;
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub struct ResourceId(pub String);

impl ResourceId {
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for ResourceId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub enum ResourceKind {
    Repository,
    Organization,
    StorageAllocation,
    CapabilityRegistration,
    CapabilityDeployment,
    BillingAnchor,
    QuotaState,
    Channel,
    Session,
    World,
    AudienceSession,
}

impl std::fmt::Display for ResourceKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Repository => write!(f, "Repository"),
            Self::Organization => write!(f, "Organization"),
            Self::StorageAllocation => write!(f, "StorageAllocation"),
            Self::CapabilityRegistration => write!(f, "CapabilityRegistration"),
            Self::CapabilityDeployment => write!(f, "CapabilityDeployment"),
            Self::BillingAnchor => write!(f, "BillingAnchor"),
            Self::QuotaState => write!(f, "QuotaState"),
            Self::Channel => write!(f, "Channel"),
            Self::Session => write!(f, "Session"),
            Self::World => write!(f, "World"),
            Self::AudienceSession => write!(f, "AudienceSession"),
        }
    }
}

impl ResourceKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Repository => "Repository",
            Self::Organization => "Organization",
            Self::StorageAllocation => "StorageAllocation",
            Self::CapabilityRegistration => "CapabilityRegistration",
            Self::CapabilityDeployment => "CapabilityDeployment",
            Self::BillingAnchor => "BillingAnchor",
            Self::QuotaState => "QuotaState",
            Self::Channel => "Channel",
            Self::Session => "Session",
            Self::World => "World",
            Self::AudienceSession => "AudienceSession",
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct OwnerReference {
    pub kind: ResourceKind,
    pub id: ResourceId,
    pub name: String,
}

pub trait Resource: Send + Sync {
    fn id(&self) -> &ResourceId;
    fn version(&self) -> u64;
    fn finalizers(&self) -> &[String];
    fn deletion_requested(&self) -> bool;
    fn owner_refs(&self) -> &[OwnerReference];
}

#[derive(Debug, Clone)]
pub struct ReconcileContext {
    pub attempt: u32,
    pub last_error_kind: Option<String>,
}

impl ReconcileContext {
    pub fn new() -> Self {
        Self {
            attempt: 1,
            last_error_kind: None,
        }
    }
}

pub enum ReconcileResult {
    Ok,
    RequeueAfter(Duration),
}

#[derive(Debug, Clone)]
pub enum ErrorPolicy {
    Backoff {
        initial: Duration,
        multiplier: f64,
        max: Duration,
        jitter: f64,
    },
    ExtendedBackoff {
        max: Duration,
    },
    Discard,
}

#[derive(Debug, Error)]
pub enum HealthError {
    #[error("Controller unhealthy: {0}")]
    Unhealthy(String),
}

#[async_trait]
pub trait Controller: Send + Sync {
    type Resource: Resource + Send + Sync;
    type Error: std::error::Error + Send + Sync + 'static;

    async fn reconcile(
        &self,
        resource: std::sync::Arc<Self::Resource>,
        ctx: ReconcileContext,
    ) -> Result<ReconcileResult, Self::Error>;

    fn error_policy(
        &self,
        resource: std::sync::Arc<Self::Resource>,
        error: &Self::Error,
        ctx: ReconcileContext,
    ) -> ErrorPolicy;

    fn finalizers(&self) -> &[&'static str] {
        &[]
    }

    async fn health_check(&self) -> Result<(), HealthError>;
}
