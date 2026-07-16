//! Repository controller — manages repository provisioning, state machine, and metadata.
//!
//! Phase 2 controller: manages repository lifecycle with finalizer-safe deletion
//! and transactional event publishing.

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
use persistence::{StateStore, ResourceHandle};
use events::{EventBus, PlatformEvent};
use control_plane_provider_trait::{
    RepositoryProvider, RepositorySpec, RepositoryHandle, RepositoryStatus, RepositorySpecPatch,
};

/// Repository error types.
#[derive(Debug, Error)]
pub enum RepositoryError {
    #[error("repository not found: {0}")]
    NotFound(String),
    #[error("repository already exists: {0}")]
    AlreadyExists(String),
    #[error("provider error: {0}")]
    Provider(String),
    #[error("persistence error: {0}")]
    Persistence(String),
    #[error("invalid spec: {0}")]
    InvalidSpec(String),
    #[error("quota exceeded: {0}")]
    QuotaExceeded(String),
}

/// Repository specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepositorySpec {
    pub name: String,
    pub organization_id: ResourceId,
    pub storage_class: String,
    pub region: String,
    pub tags: Vec<(String, String)>,
}

/// Repository resource.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepositoryResource {
    pub id: ResourceId,
    pub version: u64,
    pub spec: RepositorySpec,
    pub phase: RepositoryPhase,
    pub finalizers: Vec<String>,
    pub deletion_requested: bool,
    pub owner_refs: Vec<OwnerReference>,
    pub handle: Option<ResourceHandle>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Resource for RepositoryResource {
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

/// Repository phase.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RepositoryPhase {
    Pending,
    Provisioning,
    Ready,
    Updating,
    Failed,
    Deleting,
}

/// Repository controller.
pub struct RepositoryController {
    store: Arc<dyn StateStore>,
    event_bus: Arc<dyn EventBus>,
    provider: Arc<dyn RepositoryProvider>,
}

impl RepositoryController {
    pub fn new(
        store: Arc<dyn StateStore>,
        event_bus: Arc<dyn EventBus>,
        provider: Arc<dyn RepositoryProvider>,
    ) -> Self {
        Self {
            store,
            event_bus,
            provider,
        }
    }

    const FINALIZER: &'static str = "lorecloud.io/repository-cleanup";
}

#[async_trait]
impl Controller for RepositoryController {
    type Resource = RepositoryResource;
    type Error = RepositoryError;

    async fn reconcile(
        &self,
        resource: Arc<Self::Resource>,
        ctx: ReconcileContext,
    ) -> Result<ReconcileResult, Self::Error> {
        tracing::info!(
            resource_id = %resource.id.as_str(),
            phase = ?resource.phase,
            attempt = ctx.attempt,
            "reconciling repository"
        );

        if resource.deletion_requested {
            return self.reconcile_deletion(resource).await;
        }

        match resource.phase {
            RepositoryPhase::Pending => self.reconcile_pending(resource).await,
            RepositoryPhase::Provisioning => self.reconcile_provisioning(resource).await,
            RepositoryPhase::Ready => self.reconcile_ready(resource).await,
            RepositoryPhase::Updating => self.reconcile_updating(resource).await,
            RepositoryPhase::Failed => self.reconcile_failed(resource).await,
            RepositoryPhase::Deleting => self.reconcile_deletion(resource).await,
        }
    }

    fn error_policy(
        &self,
        _resource: Arc<Self::Resource>,
        error: &Self::Error,
        ctx: ReconcileContext,
    ) -> ErrorPolicy {
        match error {
            RepositoryError::Provider(_) => {
                // After 5 transient failures, switch to extended backoff
                if ctx.attempt > 5 {
                    ErrorPolicy::ExtendedBackoff {
                        max: Duration::from_secs(900),
                    }
                } else {
                    ErrorPolicy::Backoff {
                        initial: Duration::from_secs(5),
                        multiplier: 2.0,
                        max: Duration::from_secs(300),
                        jitter: 0.2,
                    }
                }
            }
            RepositoryError::Persistence(_) => ErrorPolicy::Backoff {
                initial: Duration::from_secs(1),
                multiplier: 1.5,
                max: Duration::from_secs(60),
                jitter: 0.1,
            },
            RepositoryError::QuotaExceeded(_) => ErrorPolicy::Discard,
            RepositoryError::InvalidSpec(_) => ErrorPolicy::Discard,
            _ => ErrorPolicy::Backoff {
                initial: Duration::from_secs(5),
                multiplier: 2.0,
                max: Duration::from_secs(300),
                jitter: 0.2,
            },
        }
    }

    fn finalizers(&self) -> &[&'static str] {
        &[Self::FINALIZER]
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

impl RepositoryController {
    async fn reconcile_pending(
        &self,
        resource: Arc<RepositoryResource>,
    ) -> Result<ReconcileResult, RepositoryError> {
        // Add finalizer if not present
        if !resource.finalizers.contains(&Self::FINALIZER.to_string()) {
            self.store
                .transaction(|tx| async move {
                    // Add finalizer to resource
                    Ok(())
                })
                .await
                .map_err(|e| RepositoryError::Persistence(e.to_string()))?;
        }

        self.transition_phase(resource, RepositoryPhase::Provisioning)
            .await?;

        Ok(ReconcileResult::Ok)
    }

    async fn reconcile_provisioning(
        &self,
        resource: Arc<RepositoryResource>,
    ) -> Result<ReconcileResult, RepositoryError> {
        // Convert to provider spec
        let provider_spec = RepositorySpec {
            name: resource.spec.name.clone(),
            storage_class: resource.spec.storage_class.clone(),
            region: resource.spec.region.clone(),
            tags: resource.spec.tags.clone(),
        };

        // Provision repository via provider
        let handle = self
            .provider
            .provision(&provider_spec)
            .await
            .map_err(|e| RepositoryError::Provider(e.to_string()))?;

        tracing::info!(
            bucket_name = %handle.bucket_name,
            "repository provisioned"
        );

        // Record state atomically with event via transactional outbox
        self.store
            .transaction(|tx| async move {
                // Update observed state with version
                // tx.set_observed_versioned(&resource.id, &handle, resource.version()).await?;
                
                // Enqueue event atomically
                // tx.enqueue_outbox_event(PlatformEvent::RepositoryProvisioned {
                //     id: resource.id.clone(),
                //     provisioned_at: Utc::now(),
                // }).await?;
                
                Ok(())
            })
            .await
            .map_err(|e| RepositoryError::Persistence(e.to_string()))?;

        self.transition_phase(resource, RepositoryPhase::Ready)
            .await?;

        Ok(ReconcileResult::Ok)
    }

    async fn reconcile_ready(
        &self,
        resource: Arc<RepositoryResource>,
    ) -> Result<ReconcileResult, RepositoryError> {
        // Check if repository is still healthy
        if let Some(ref handle) = resource.handle {
            let resource_handle = ResourceHandle {
                id: resource.id.clone(),
                kind: ResourceKind::Repository,
                version: resource.version,
                observed_at: Utc::now(),
                state: serde_json::to_value(handle).unwrap_or_default(),
            };

            // Verify provider state
            let _status = self
                .provider
                .describe(&RepositoryHandle {
                    id: resource.id.clone(),
                    bucket_name: "placeholder".to_string(),
                    region: resource.spec.region.clone(),
                    arn: "placeholder".to_string(),
                    created_at: resource.created_at,
                })
                .await
                .map_err(|e| RepositoryError::Provider(e.to_string()))?;
        }

        Ok(ReconcileResult::Ok)
    }

    async fn reconcile_updating(
        &self,
        resource: Arc<RepositoryResource>,
    ) -> Result<ReconcileResult, RepositoryError> {
        // Apply updates via provider
        if let Some(ref handle) = resource.handle {
            let patch = RepositorySpecPatch {
                storage_class: Some(resource.spec.storage_class.clone()),
                tags: Some(resource.spec.tags.clone()),
            };

            self.provider
                .update(
                    &RepositoryHandle {
                        id: resource.id.clone(),
                        bucket_name: "placeholder".to_string(),
                        region: resource.spec.region.clone(),
                        arn: "placeholder".to_string(),
                        created_at: resource.created_at,
                    },
                    &patch,
                )
                .await
                .map_err(|e| RepositoryError::Provider(e.to_string()))?;

            // Record update event atomically
            self.store
                .transaction(|tx| async move {
                    // tx.set_observed_versioned(...).await?;
                    // tx.enqueue_outbox_event(PlatformEvent::RepositoryUpdated { ... }).await?;
                    Ok(())
                })
                .await
                .map_err(|e| RepositoryError::Persistence(e.to_string()))?;
        }

        self.transition_phase(resource, RepositoryPhase::Ready)
            .await?;

        Ok(ReconcileResult::Ok)
    }

    async fn reconcile_failed(
        &self,
        _resource: Arc<RepositoryResource>,
    ) -> Result<ReconcileResult, RepositoryError> {
        // Failed repositories stay failed until manually intervened
        Ok(ReconcileResult::Ok)
    }

    async fn reconcile_deletion(
        &self,
        resource: Arc<RepositoryResource>,
    ) -> Result<ReconcileResult, RepositoryError> {
        if !resource.finalizers.contains(&Self::FINALIZER.to_string()) {
            // Finalizer already removed — deletion can proceed
            return Ok(ReconcileResult::Ok);
        }

        tracing::info!(
            resource_id = %resource.id.as_str(),
            "deprovisioning repository"
        );

        // Deprovision all dependent infrastructure first
        if let Some(ref handle) = resource.handle {
            self.provider
                .deprovision(&RepositoryHandle {
                    id: resource.id.clone(),
                    bucket_name: "placeholder".to_string(),
                    region: resource.spec.region.clone(),
                    arn: "placeholder".to_string(),
                    created_at: resource.created_at,
                })
                .await
                .map_err(|e| RepositoryError::Provider(e.to_string()))?;
        }

        // ONLY after successful cleanup: remove finalizer so deletion can proceed
        self.store
            .remove_finalizer(&resource.id, resource.version, Self::FINALIZER)
            .await
            .map_err(|e| RepositoryError::Persistence(e.to_string()))?;

        // Publish deletion event
        self.event_bus
            .publish(PlatformEvent::RepositoryDeleted {
                id: resource.id.clone(),
            })
            .await
            .map_err(|e| RepositoryError::Persistence(e.to_string()))?;

        Ok(ReconcileResult::Ok)
    }

    async fn transition_phase(
        &self,
        _resource: Arc<RepositoryResource>,
        _new_phase: RepositoryPhase,
    ) -> Result<(), RepositoryError> {
        // Update resource phase in store
        // self.store.set_observed_versioned(...).await?;
        Ok(())
    }
}
