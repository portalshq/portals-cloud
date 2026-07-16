//! NAP resolver controller — manages NAP address → resource binding and resolver record lifecycle.
//!
//! Phase 3 controller (Horizon B): Entertainment Platform.

use std::sync::Arc;
use std::time::Duration;
use async_trait::async_trait;
use thiserror::Error;
use serde::{Serialize, Deserialize};
use chrono::{DateTime, Utc};

use reconciler::{
    Controller, Resource, ResourceId, ResourceKind, OwnerReference,
    ReconcileContext, ReconcileResult, ErrorPolicy, HealthError,
};
use persistence::StateStore;
use events::EventBus;

/// NAP resolver error types.
#[derive(Debug, Error)]
pub enum NAPResolverError {
    #[error("resolver record not found: {0}")]
    NotFound(String),
    #[error("persistence error: {0}")]
    Persistence(String),
    #[error("invalid spec: {0}")]
    InvalidSpec(String),
}

/// NAP resolver specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NAPResolverSpec {
    pub nap_address: String,
    pub resource_id: ResourceId,
    pub resource_kind: ResourceKind,
}

/// NAP resolver resource.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NAPResolverResource {
    pub id: ResourceId,
    pub version: u64,
    pub spec: NAPResolverSpec,
    pub phase: NAPResolverPhase,
    pub finalizers: Vec<String>,
    pub deletion_requested: bool,
    pub owner_refs: Vec<OwnerReference>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Resource for NAPResolverResource {
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

/// NAP resolver phase.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum NAPResolverPhase {
    Pending,
    Bound,
    Failed,
}

/// NAP resolver controller.
pub struct NAPResolverController {
    store: Arc<dyn StateStore>,
    event_bus: Arc<dyn EventBus>,
}

impl NAPResolverController {
    pub fn new(store: Arc<dyn StateStore>, event_bus: Arc<dyn EventBus>) -> Self {
        Self { store, event_bus }
    }
}

#[async_trait]
impl Controller for NAPResolverController {
    type Resource = NAPResolverResource;
    type Error = NAPResolverError;

    async fn reconcile(
        &self,
        resource: Arc<Self::Resource>,
        _ctx: ReconcileContext,
    ) -> Result<ReconcileResult, Self::Error> {
        tracing::info!(
            resource_id = %resource.id.as_str(),
            phase = ?resource.phase,
            "reconciling NAP resolver"
        );

        match resource.phase {
            NAPResolverPhase::Pending => self.reconcile_pending(resource).await,
            NAPResolverPhase::Bound => Ok(ReconcileResult::Ok),
            NAPResolverPhase::Failed => Ok(ReconcileResult::Ok),
        }
    }

    fn error_policy(
        &self,
        _resource: Arc<Self::Resource>,
        error: &Self::Error,
        _ctx: ReconcileContext,
    ) -> ErrorPolicy {
        match error {
            NAPResolverError::Persistence(_) => ErrorPolicy::Backoff {
                initial: Duration::from_secs(1),
                multiplier: 1.5,
                max: Duration::from_secs(60),
                jitter: 0.1,
            },
            NAPResolverError::InvalidSpec(_) => ErrorPolicy::Discard,
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

impl NAPResolverController {
    async fn reconcile_pending(
        &self,
        resource: Arc<NAPResolverResource>,
    ) -> Result<ReconcileResult, NAPResolverError> {
        // Bind NAP address to resource
        self.transition_phase(resource, NAPResolverPhase::Bound)
            .await?;

        Ok(ReconcileResult::Ok)
    }

    async fn transition_phase(
        &self,
        _resource: Arc<NAPResolverResource>,
        _new_phase: NAPResolverPhase,
    ) -> Result<(), NAPResolverError> {
        Ok(())
    }
}
