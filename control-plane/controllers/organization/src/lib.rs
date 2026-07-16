//! Organization controller — manages organization lifecycle and identity namespace.
//!
//! Phase 1 controller: starts before resource controllers.

use std::sync::Arc;
use std::time::Duration;
use async_trait::async_trait;
use thiserror::Error;
use serde::{Serialize, Deserialize};
use chrono::{DateTime, Utc};
use uuid::Uuid;

use reconciler::{
    Controller, Resource, ResourceId, ResourceKind, OwnerReference,
    ReconcileContext, ReconcileResult, ErrorPolicy, HealthError,
};
use persistence::StateStore;
use events::{EventBus, PlatformEvent};
use control_plane_provider_trait::{IdentityProvider, NamespaceSpec, Namespace};

/// Organization error types.
#[derive(Debug, Error)]
pub enum OrganizationError {
    #[error("organization not found: {0}")]
    NotFound(String),
    #[error("organization already exists: {0}")]
    AlreadyExists(String),
    #[error("provider error: {0}")]
    Provider(String),
    #[error("persistence error: {0}")]
    Persistence(String),
    #[error("invalid spec: {0}")]
    InvalidSpec(String),
}

/// Organization specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrganizationSpec {
    pub name: String,
    pub display_name: String,
    pub billing_plan: String,
}

/// Organization resource.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrganizationResource {
    pub id: ResourceId,
    pub version: u64,
    pub spec: OrganizationSpec,
    pub phase: OrganizationPhase,
    pub finalizers: Vec<String>,
    pub deletion_requested: bool,
    pub owner_refs: Vec<OwnerReference>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Resource for OrganizationResource {
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

/// Organization phase.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OrganizationPhase {
    Pending,
    Provisioning,
    Ready,
    Failed,
    Deleting,
}

/// Organization controller.
pub struct OrganizationController {
    store: Arc<dyn StateStore>,
    event_bus: Arc<dyn EventBus>,
    identity_provider: Arc<dyn IdentityProvider>,
}

impl OrganizationController {
    pub fn new(
        store: Arc<dyn StateStore>,
        event_bus: Arc<dyn EventBus>,
        identity_provider: Arc<dyn IdentityProvider>,
    ) -> Self {
        Self {
            store,
            event_bus,
            identity_provider,
        }
    }

    const FINALIZER: &'static str = "lorecloud.io/organization-cleanup";
}

#[async_trait]
impl Controller for OrganizationController {
    type Resource = OrganizationResource;
    type Error = OrganizationError;

    async fn reconcile(
        &self,
        resource: Arc<Self::Resource>,
        ctx: ReconcileContext,
    ) -> Result<ReconcileResult, Self::Error> {
        tracing::info!(
            resource_id = %resource.id.as_str(),
            phase = ?resource.phase,
            "reconciling organization"
        );

        if resource.deletion_requested {
            return self.reconcile_deletion(resource).await;
        }

        match resource.phase {
            OrganizationPhase::Pending => self.reconcile_pending(resource).await,
            OrganizationPhase::Provisioning => self.reconcile_provisioning(resource).await,
            OrganizationPhase::Ready => self.reconcile_ready(resource).await,
            OrganizationPhase::Failed => self.reconcile_failed(resource).await,
            OrganizationPhase::Deleting => self.reconcile_deletion(resource).await,
        }
    }

    fn error_policy(
        &self,
        _resource: Arc<Self::Resource>,
        error: &Self::Error,
        ctx: ReconcileContext,
    ) -> ErrorPolicy {
        match error {
            OrganizationError::Provider(_) => {
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
            OrganizationError::Persistence(_) => ErrorPolicy::Backoff {
                initial: Duration::from_secs(1),
                multiplier: 1.5,
                max: Duration::from_secs(60),
                jitter: 0.1,
            },
            OrganizationError::InvalidSpec(_) => ErrorPolicy::Discard,
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
        self.identity_provider
            .health_check()
            .await
            .map_err(|e| HealthError::ProviderUnhealthy(e.to_string()))?;
        Ok(())
    }
}

impl OrganizationController {
    async fn reconcile_pending(
        &self,
        resource: Arc<OrganizationResource>,
    ) -> Result<ReconcileResult, OrganizationError> {
        // Add finalizer if not present
        if !resource.finalizers.contains(&Self::FINALIZER.to_string()) {
            self.store
                .transaction(|tx| async move {
                    // In a real implementation, we'd add the finalizer here
                    Ok(())
                })
                .await
                .map_err(|e| OrganizationError::Persistence(e.to_string()))?;
        }

        // Transition to provisioning
        self.transition_phase(resource, OrganizationPhase::Provisioning)
            .await?;

        Ok(ReconcileResult::Ok)
    }

    async fn reconcile_provisioning(
        &self,
        resource: Arc<OrganizationResource>,
    ) -> Result<ReconcileResult, OrganizationError> {
        // Provision identity namespace
        let namespace_spec = NamespaceSpec {
            org_id: resource.id.clone(),
            name: resource.spec.name.clone(),
        };

        let namespace = self
            .identity_provider
            .create_namespace(&namespace_spec)
            .await
            .map_err(|e| OrganizationError::Provider(e.to_string()))?;

        tracing::info!(
            namespace_id = %namespace.id.as_str(),
            "identity namespace provisioned"
        );

        // Record state and publish event
        self.store
            .transaction(|tx| async move {
                // Update observed state
                // tx.set_observed_versioned(...).await?;
                // Enqueue event
                // tx.enqueue_outbox_event(PlatformEvent::OrganizationCreated { ... }).await?;
                Ok(())
            })
            .await
            .map_err(|e| OrganizationError::Persistence(e.to_string()))?;

        self.transition_phase(resource, OrganizationPhase::Ready)
            .await?;

        Ok(ReconcileResult::Ok)
    }

    async fn reconcile_ready(
        &self,
        _resource: Arc<OrganizationResource>,
    ) -> Result<ReconcileResult, OrganizationError> {
        // No-op for ready organizations
        Ok(ReconcileResult::Ok)
    }

    async fn reconcile_failed(
        &self,
        _resource: Arc<OrganizationResource>,
    ) -> Result<ReconcileResult, OrganizationError> {
        // Failed organizations stay failed until manually intervened
        Ok(ReconcileResult::Ok)
    }

    async fn reconcile_deletion(
        &self,
        resource: Arc<OrganizationResource>,
    ) -> Result<ReconcileResult, OrganizationError> {
        if !resource.finalizers.contains(&Self::FINALIZER.to_string()) {
            return Ok(ReconcileResult::Ok);
        }

        // Deprovision identity namespace
        // self.identity_provider.delete_namespace(...).await?;

        // Remove finalizer
        self.store
            .remove_finalizer(&resource.id, resource.version, Self::FINALIZER)
            .await
            .map_err(|e| OrganizationError::Persistence(e.to_string()))?;

        // Publish deletion event
        self.event_bus
            .publish(PlatformEvent::OrganizationDeleted {
                id: resource.id.clone(),
            })
            .await
            .map_err(|e| OrganizationError::Persistence(e.to_string()))?;

        Ok(ReconcileResult::Ok)
    }

    async fn transition_phase(
        &self,
        resource: Arc<OrganizationResource>,
        new_phase: OrganizationPhase,
    ) -> Result<(), OrganizationError> {
        // Update resource phase in store
        // self.store.set_observed_versioned(...).await?;
        Ok(())
    }
}
