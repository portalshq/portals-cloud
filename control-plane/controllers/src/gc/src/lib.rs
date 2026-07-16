//! GC controller — manages garbage collection of unused resources.
//!
//! STUB: Migrated from old control plane, compartmentalized for future integration.
//! Currently provides placeholder structure for garbage collection functionality.

use std::sync::Arc;
use std::time::Duration;
use async_trait::async_trait;
use thiserror::Error;
use chrono::{DateTime, Utc};

use models::{Controller, Resource, ResourceId, ResourceKind, OwnerReference, ReconcileContext, ReconcileResult, ErrorPolicy, HealthError};

/// GC error types.
#[derive(Debug, Error)]
pub enum GCError {
    #[error("gc policy not found: {0}")]
    NotFound(String),
    #[error("persistence error: {0}")]
    Persistence(String),
}

/// GC policy specification.
#[derive(Debug, Clone)]
pub struct GCPolicySpec {
    pub resource_kind: ResourceKind,
    pub max_age_days: u32,
    pub max_unused_days: u32,
}

/// GC policy resource.
#[derive(Debug, Clone)]
pub struct GCPolicyResource {
    pub id: ResourceId,
    pub version: u64,
    pub spec: GCPolicySpec,
    pub phase: GCPhase,
    pub finalizers: Vec<String>,
    pub deletion_requested: bool,
    pub owner_refs: Vec<OwnerReference>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Resource for GCPolicyResource {
    fn id(&self) -> &ResourceId {
        &self.id
    }

    fn version(&self) -> u64 {
        self.version
    }

    fn finalizers(&self) -> &[String] {
        &self.finalizers
    }

    fn deletion_requested(&self) -> bool {
        self.deletion_requested
    }

    fn owner_refs(&self) -> &[OwnerReference] {
        &self.owner_refs
    }
}

/// GC phase.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum GCPhase {
    Active,
    Collecting,
}

/// GC controller.
/// STUB: Placeholder structure only - not yet implemented.
pub struct GCController;

impl GCController {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl Controller for GCController {
    type Resource = GCPolicyResource;
    type Error = GCError;

    async fn reconcile(
        &self,
        resource: Arc<Self::Resource>,
        _ctx: ReconcileContext,
    ) -> Result<ReconcileResult, Self::Error> {
        tracing::info!(
            resource_id = %resource.id.as_str(),
            phase = ?resource.phase,
            "reconciling gc policy (STUB - not implemented)"
        );
        Ok(ReconcileResult::Ok)
    }

    fn error_policy(
        &self,
        _resource: Arc<Self::Resource>,
        error: &Self::Error,
        _ctx: ReconcileContext,
    ) -> ErrorPolicy {
        match error {
            GCError::Persistence(_) => ErrorPolicy::Backoff {
                initial: Duration::from_secs(1),
                multiplier: 1.5,
                max: Duration::from_secs(60),
                jitter: 0.1,
            },
            _ => ErrorPolicy::Discard,
        }
    }

    fn finalizers(&self) -> &[&'static str] {
        &[]
    }

    async fn health_check(&self) -> Result<(), HealthError> {
        Ok(())
    }
}

