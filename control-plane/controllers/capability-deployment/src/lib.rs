//! Capability deployment controller — manages capability runtime artifact deployment and rollout.
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
use events::{EventBus, PlatformEvent};

/// Capability deployment error types.
#[derive(Debug, Error)]
pub enum CapabilityDeploymentError {
    #[error("deployment not found: {0}")]
    NotFound(String),
    #[error("persistence error: {0}")]
    Persistence(String),
    #[error("invalid spec: {0}")]
    InvalidSpec(String),
}

/// Capability deployment specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CapabilityDeploymentSpec {
    pub capability_id: ResourceId,
    pub version: String,
    pub target: String,
    pub rollout_strategy: String,
}

/// Capability deployment resource.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CapabilityDeploymentResource {
    pub id: ResourceId,
    pub version: u64,
    pub spec: CapabilityDeploymentSpec,
    pub phase: CapabilityDeploymentPhase,
    pub finalizers: Vec<String>,
    pub deletion_requested: bool,
    pub owner_refs: Vec<OwnerReference>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
`

impl Resource for CapabilityDeploymentResource {
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

/// Capability deployment phase.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CapabilityDeploymentPhase {
    Pending,
    Deploying,
    Deployed,
    RollingBack,
    Failed,
}

/// Capability deployment controller.
pub struct CapabilityDeploymentController {
    store: Arc<dyn StateStore>,
    event_bus: Arc<dyn EventBus>,
}

impl CapabilityDeploymentController {
    pub fn new(store: Arc<dyn StateStore>, event_bus: Arc<dyn EventBus>) -> Self {
        Self { store, event_bus }
    }
}

#[async_trait]
impl Controller for CapabilityDeploymentController {
    type Resource = CapabilityDeploymentResource;
    type Error = CapabilityDeploymentError;

    async fn reconcile(
        &self,
        resource: Arc<Self::Resource>,
        _ctx: ReconcileContext,
    ) -> Result<ReconcileResult, Self::Error> {
        tracing::info!(
            resource_id = %resource.id.as_str(),
            phase = ?resource.phase,
            "reconciling capability deployment"
        );

        match resource.phase {
            CapabilityDeploymentPhase::Pending => self.reconcile_pending(resource).await,
            CapabilityDeploymentPhase::Deploying => self.reconcile_deploying(resource).await,
            CapabilityDeploymentPhase::Deployed => Ok(ReconcileResult::Ok),
            CapabilityDeploymentPhase::RollingBack => self.reconcile_rolling_back(resource).await,
            CapabilityDeploymentPhase::Failed => Ok(ReconcileResult::Ok),
        }
    }

    fn error_policy(
        &self,
        _resource: Arc<Self::Resource>,
        error: &Self::Error,
        _ctx: ReconcileContext,
    ) -> ErrorPolicy {
        match error {
            CapabilityDeploymentError::Persistence(_) => ErrorPolicy::Backoff {
                initial: Duration::from_secs(1),
                multiplier: 1.5,
                max: Duration::from_secs(60),
                jitter: 0.1,
            },
            CapabilityDeploymentError::InvalidSpec(_) => ErrorPolicy::Discard,
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

impl CapabilityDeploymentController {
    async fn reconcile_pending(
        &self,
        resource: Arc<CapabilityDeploymentResource>,
    ) -> Result<ReconcileResult, CapabilityDeploymentError> {
        self.transition_phase(resource, CapabilityDeploymentPhase::Deploying)
            .await?;

        Ok(ReconcileResult::Ok)
    }

    async fn reconcile_deploying(
        &self,
        resource: Arc<CapabilityDeploymentResource>,
    ) -> Result<ReconcileResult, CapabilityDeploymentError> {
        self.event_bus
            .publish(PlatformEvent::CapabilityDeployed {
                id: resource.spec.capability_id.clone(),
                target: resource.spec.target.clone(),
            })
            .await
            .map_err(|e| CapabilityDeploymentError::Persistence(e.to_string()))?;

        self.transition_phase(resource, CapabilityDeploymentPhase::Deployed)
            .await?;

        Ok(ReconcileResult::Ok)
    }

    async fn reconcile_rolling_back(
        &self,
        resource: Arc<CapabilityDeploymentResource>,
    ) -> Result<ReconcileResult, CapabilityDeploymentError> {
        self.transition_phase(resource, CapabilityDeploymentPhase::Failed)
            .await?;

        Ok(ReconcileResult::Ok)
    }

    async fn transition_phase(
        &self,
        _resource: Arc<CapabilityDeploymentResource>,
        _new_phase: CapabilityDeploymentPhase,
    ) -> Result<(), CapabilityDeploymentError> {
        Ok(())
    }
}
