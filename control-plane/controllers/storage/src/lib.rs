//! Storage controller — manages storage bucket provisioning and quota enforcement.
//!
//! Phase 2 controller: manages storage allocations with health check and list_resources.

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
use control_plane_provider_trait::{StorageProvider, StorageAllocationSpec, StorageAllocation, StorageUsage};

/// Storage error types.
#[derive(Debug, Error)]
pub enum StorageError {
    #[error("storage allocation not found: {0}")]
    NotFound(String),
    #[error("provider error: {0}")]
    Provider(String),
    #[error("persistence error: {0}")]
    Persistence(String),
    #[error("invalid spec: {0}")]
    InvalidSpec(String),
}

/// Storage allocation specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageAllocationSpec {
    pub quota_bytes: u64,
    pub tier: String,
    pub region: String,
}

/// Storage allocation resource.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageAllocationResource {
    pub id: ResourceId,
    pub version: u64,
    pub spec: StorageAllocationSpec,
    pub phase: StoragePhase,
    pub finalizers: Vec<String>,
    pub deletion_requested: bool,
    pub owner_refs: Vec<OwnerReference>,
    pub allocation: Option<StorageAllocation>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Resource for StorageAllocationResource {
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

/// Storage phase.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum StoragePhase {
    Pending,
    Allocated,
    Resizing,
    Failed,
    Deleting,
}

/// Storage controller.
pub struct StorageController {
    store: Arc<dyn StateStore>,
    event_bus: Arc<dyn EventBus>,
    provider: Arc<dyn StorageProvider>,
}

impl StorageController {
    pub fn new(
        store: Arc<dyn StateStore>,
        event_bus: Arc<dyn EventBus>,
        provider: Arc<dyn StorageProvider>,
    ) -> Self {
        Self {
            store,
            event_bus,
            provider,
        }
    }
}

#[async_trait]
impl Controller for StorageController {
    type Resource = StorageAllocationResource;
    type Error = StorageError;

    async fn reconcile(
        &self,
        resource: Arc<Self::Resource>,
        _ctx: ReconcileContext,
    ) -> Result<ReconcileResult, Self::Error> {
        tracing::info!(
            resource_id = %resource.id.as_str(),
            phase = ?resource.phase,
            "reconciling storage allocation"
        );

        if resource.deletion_requested {
            return self.reconcile_deletion(resource).await;
        }

        match resource.phase {
            StoragePhase::Pending => self.reconcile_pending(resource).await,
            StoragePhase::Allocated => self.reconcile_allocated(resource).await,
            StoragePhase::Resizing => self.reconcile_resizing(resource).await,
            StoragePhase::Failed => Ok(ReconcileResult::Ok),
            StoragePhase::Deleting => self.reconcile_deletion(resource).await,
        }
    }

    fn error_policy(
        &self,
        _resource: Arc<Self::Resource>,
        error: &Self::Error,
        _ctx: ReconcileContext,
    ) -> ErrorPolicy {
        match error {
            StorageError::Provider(_) => ErrorPolicy::Backoff {
                initial: Duration::from_secs(5),
                multiplier: 2.0,
                max: Duration::from_secs(300),
                jitter: 0.2,
            },
            StorageError::Persistence(_) => ErrorPolicy::Backoff {
                initial: Duration::from_secs(1),
                multiplier: 1.5,
                max: Duration::from_secs(60),
                jitter: 0.1,
            },
            StorageError::InvalidSpec(_) => ErrorPolicy::Discard,
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
        self.provider
            .health_check()
            .await
            .map_err(|e| HealthError::ProviderUnhealthy(e.to_string()))?;
        Ok(())
    }
}

impl StorageController {
    async fn reconcile_pending(
        &self,
        resource: Arc<StorageAllocationResource>,
    ) -> Result<ReconcileResult, StorageError> {
        let spec = StorageAllocationSpec {
            quota_bytes: resource.spec.quota_bytes,
            tier: resource.spec.tier.clone(),
            region: resource.spec.region.clone(),
        };

        let allocation = self
            .provider
            .allocate(&spec)
            .await
            .map_err(|e| StorageError::Provider(e.to_string()))?;

        self.transition_phase(resource, StoragePhase::Allocated)
            .await?;

        Ok(ReconcileResult::Ok)
    }

    async fn reconcile_allocated(
        &self,
        _resource: Arc<StorageAllocationResource>,
    ) -> Result<ReconcileResult, StorageError> {
        Ok(ReconcileResult::Ok)
    }

    async fn reconcile_resizing(
        &self,
        resource: Arc<StorageAllocationResource>,
    ) -> Result<ReconcileResult, StorageError> {
        if let Some(ref allocation) = resource.allocation {
            self.provider
                .resize(allocation, resource.spec.quota_bytes)
                .await
                .map_err(|e| StorageError::Provider(e.to_string()))?;
        }

        self.transition_phase(resource, StoragePhase::Allocated)
            .await?;

        Ok(ReconcileResult::Ok)
    }

    async fn reconcile_deletion(
        &self,
        resource: Arc<StorageAllocationResource>,
    ) -> Result<ReconcileResult, StorageError> {
        if let Some(ref allocation) = resource.allocation {
            self.provider
                .deallocate(allocation)
                .await
                .map_err(|e| StorageError::Provider(e.to_string()))?;
        }

        Ok(ReconcileResult::Ok)
    }

    async fn transition_phase(
        &self,
        _resource: Arc<StorageAllocationResource>,
        _new_phase: StoragePhase,
    ) -> Result<(), StorageError> {
        Ok(())
    }
}
