//! Garbage collection controller — owner-reference validation and orphan cleanup.
//!
//! Phase 2 controller: watches for resources whose owners no longer exist
//! and initiates finalizer-safe deletion.

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

/// GC error types.
#[derive(Debug, Error)]
pub enum GcError {
    #[error("persistence error: {0}")]
    Persistence(String),
}

/// Any resource for GC purposes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnyResource {
    pub id: ResourceId,
    pub kind: ResourceKind,
    pub version: u64,
    pub finalizers: Vec<String>,
    pub deletion_requested: bool,
    pub owner_refs: Vec<OwnerReference>,
}

impl Resource for AnyResource {
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

/// Garbage collection controller.
pub struct GarbageCollectionController {
    store: Arc<dyn StateStore>,
    event_bus: Arc<dyn EventBus>,
}

impl GarbageCollectionController {
    pub fn new(store: Arc<dyn StateStore>, event_bus: Arc<dyn EventBus>) -> Self {
        Self { store, event_bus }
    }
}

#[async_trait]
impl Controller for GarbageCollectionController {
    type Resource = AnyResource;
    type Error = GcError;

    async fn reconcile(
        &self,
        resource: Arc<Self::Resource>,
        _ctx: ReconcileContext,
    ) -> Result<ReconcileResult, Self::Error> {
        tracing::info!(
            resource_id = %resource.id.as_str(),
            kind = ?resource.kind,
            "checking for orphaned resource"
        );

        for owner_ref in resource.owner_refs() {
            let owner_exists = self
                .store
                .exists(owner_ref.kind.clone(), &owner_ref.id)
                .await
                .map_err(|e| GcError::Persistence(e.to_string()))?;

            if !owner_exists {
                tracing::warn!(
                    resource_id = %resource.id.as_str(),
                    owner_kind = ?owner_ref.kind,
                    owner_id = %owner_ref.id.as_str(),
                    "owner gone — initiating deletion"
                );

                // Owner gone — initiate deletion of this resource
                self.store
                    .mark_deletion_requested(&resource.id)
                    .await
                    .map_err(|e| GcError::Persistence(e.to_string()))?;

                // The owning controller's finalizer mechanism handles cleanup
            }
        }

        Ok(ReconcileResult::Ok)
    }

    fn error_policy(
        &self,
        _resource: Arc<Self::Resource>,
        error: &Self::Error,
        _ctx: ReconcileContext,
    ) -> ErrorPolicy {
        match error {
            GcError::Persistence(_) => ErrorPolicy::Backoff {
                initial: Duration::from_secs(1),
                multiplier: 1.5,
                max: Duration::from_secs(60),
                jitter: 0.1,
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
