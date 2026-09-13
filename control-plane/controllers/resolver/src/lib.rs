//! PX resolver controller — manages PX address → resource binding and resolver record lifecycle.
//!
//! Phase 3 controller (Horizon B): Entertainment Platform.

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use thiserror::Error;

use events::EventBus;
use persistence::StateStore;
use reconciler::{
    Controller, ErrorPolicy, HealthError, OwnerReference, ReconcileContext, ReconcileResult,
    Resource, ResourceId, ResourceKind,
};

/// PX resolver error types.
#[derive(Debug, Error)]
pub enum PXResolverError {
    #[error("resolver record not found: {0}")]
    NotFound(String),
    #[error("persistence error: {0}")]
    Persistence(String),
    #[error("invalid spec: {0}")]
    InvalidSpec(String),
}

/// PX resolver specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PXResolverSpec {
    pub px_address: String,
    pub resource_id: ResourceId,
    pub resource_kind: ResourceKind,
}

/// PX resolver resource.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PXResolverResource {
    pub id: ResourceId,
    pub version: u64,
    pub spec: PXResolverSpec,
    pub phase: PXResolverPhase,
    pub finalizers: Vec<String>,
    pub deletion_requested: bool,
    pub owner_refs: Vec<OwnerReference>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Resource for PXResolverResource {
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

/// PX resolver phase.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PXResolverPhase {
    Pending,
    Bound,
    Failed,
}

/// PX resolver controller.
pub struct PXResolverController {
    store: Arc<dyn StateStore>,
    event_bus: Arc<dyn EventBus>,
}

impl PXResolverController {
    pub fn new(store: Arc<dyn StateStore>, event_bus: Arc<dyn EventBus>) -> Self {
        Self { store, event_bus }
    }
}

#[async_trait]
impl Controller for PXResolverController {
    type Resource = PXResolverResource;
    type Error = PXResolverError;

    async fn reconcile(
        &self,
        resource: Arc<Self::Resource>,
        _ctx: ReconcileContext,
    ) -> Result<ReconcileResult, Self::Error> {
        tracing::info!(
            resource_id = %resource.id.as_str(),
            phase = ?resource.phase,
            "reconciling PX resolver"
        );

        match resource.phase {
            PXResolverPhase::Pending => self.reconcile_pending(resource).await,
            PXResolverPhase::Bound => Ok(ReconcileResult::Ok),
            PXResolverPhase::Failed => Ok(ReconcileResult::Ok),
        }
    }

    fn error_policy(
        &self,
        _resource: Arc<Self::Resource>,
        error: &Self::Error,
        _ctx: ReconcileContext,
    ) -> ErrorPolicy {
        match error {
            PXResolverError::Persistence(_) => ErrorPolicy::Backoff {
                initial: Duration::from_secs(1),
                multiplier: 1.5,
                max: Duration::from_secs(60),
                jitter: 0.1,
            },
            PXResolverError::InvalidSpec(_) => ErrorPolicy::Discard,
            _ => ErrorPolicy::Backoff {
                initial: Duration::from_secs(5),
                multiplier: 2.0,
                max: Duration::from_secs(300),
                jitter: 0.2,
            },
        }
    }

    fn finalizers(&self) -> &[&'static str] {
        &[]
    }

    async fn health_check(&self) -> Result<(), HealthError> {
        self.store
            .ping()
            .await
            .map_err(|e| HealthError::DatabaseConnection(e.to_string()))?;
        Ok(())
    }
}

impl PXResolverController {
    async fn reconcile_pending(
        &self,
        resource: Arc<PXResolverResource>,
    ) -> Result<ReconcileResult, PXResolverError> {
        // Bind PX address to resource
        self.transition_phase(resource, PXResolverPhase::Bound)
            .await?;

        Ok(ReconcileResult::Ok)
    }

    async fn transition_phase(
        &self,
        _resource: Arc<PXResolverResource>,
        _new_phase: PXResolverPhase,
    ) -> Result<(), PXResolverError> {
        Ok(())
    }
}
