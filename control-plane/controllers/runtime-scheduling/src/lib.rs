//! Runtime scheduling controller — manages compute allocation for active sessions and scale policy.
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
use control_plane_provider_trait::{ComputeProvider, ComputeSpec, ComputeHandle};

/// Runtime scheduling error types.
#[derive(Debug, Error)]
pub enum RuntimeSchedulingError {
    #[error("scheduling not found: {0}")]
    NotFound(String),
    #[error("provider error: {0}")]
    Provider(String),
    #[error("persistence error: {0}")]
    Persistence(String),
    #[error("invalid spec: {0}")]
    InvalidSpec(String),
}

/// Runtime scheduling specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeSchedulingSpec {
    pub session_id: ResourceId,
    pub cpu: u32,
    pub memory_mb: u32,
    pub scale_policy: String,
}

/// Runtime scheduling resource.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeSchedulingResource {
    pub id: ResourceId,
    pub version: u64,
    pub spec: RuntimeSchedulingSpec,
    pub phase: RuntimeSchedulingPhase,
    pub finalizers: Vec<String>,
    pub deletion_requested: bool,
    pub owner_refs: Vec<OwnerReference>,
    pub compute_handle: Option<ComputeHandle>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Resource for RuntimeSchedulingResource {
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

/// Runtime scheduling phase.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RuntimeSchedulingPhase {
    Pending,
    Scheduled,
    Scaling,
    Failed,
}

/// Runtime scheduling controller.
pub struct RuntimeSchedulingController {
    store: Arc<dyn StateStore>,
    event_bus: Arc<dyn EventBus>,
    compute_provider: Arc<dyn ComputeProvider>,
}

impl RuntimeSchedulingController {
    pub fn new(
        store: Arc<dyn StateStore>,
        event_bus: Arc<dyn EventBus>,
        compute_provider: Arc<dyn ComputeProvider>,
    ) -> Self {
        Self {
            store,
            event_bus,
            compute_provider,
        }
    }
}

#[async_trait]
impl Controller for RuntimeSchedulingController {
    type Resource = RuntimeSchedulingResource;
    type Error = RuntimeSchedulingError;

    async fn reconcile(
        &self,
        resource: Arc<Self::Resource>,
        _ctx: ReconcileContext,
    ) -> Result<ReconcileResult, Self::Error> {
        tracing::info!(
            resource_id = %resource.id.as_str(),
            phase = ?resource.phase,
            "reconciling runtime scheduling"
        );

        if resource.deletion_requested {
            return self.reconcile_deletion(resource).await;
        }

        match resource.phase {
            RuntimeSchedulingPhase::Pending => self.reconcile_pending(resource).await,
            RuntimeSchedulingPhase::Scheduled => self.reconcile_scheduled(resource).await,
            RuntimeSchedulingPhase::Scaling => self.reconcile_scaling(resource).await,
            RuntimeSchedulingPhase::Failed => Ok(ReconcileResult::Ok),
        }
    }

    fn error_policy(
        &self,
        _resource: Arc<Self::Resource>,
        error: &Self::Error,
        _ctx: ReconcileContext,
    ) -> ErrorPolicy {
        match error {
            RuntimeSchedulingError::Provider(_) => ErrorPolicy::Backoff {
                initial: Duration::from_secs(5),
                multiplier: 2.0,
                max: Duration::from_secs(300),
                jitter: 0.2,
            },
            RuntimeSchedulingError::Persistence(_) => ErrorPolicy::Backoff {
                initial: Duration::from_secs(1),
                multiplier: 1.5,
                max: Duration::from_secs(60),
                jitter: 0.1,
            },
            RuntimeSchedulingError::InvalidSpec(_) => ErrorPolicy::Discard,
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
        self.compute_provider
            .health_check()
            .await
            .map_err(|e| HealthError::ProviderUnhealthy(e.to_string()))?;
        Ok(())
    }
}

impl RuntimeSchedulingController {
    async fn reconcile_pending(
        &self,
        resource: Arc<RuntimeSchedulingResource>,
    ) -> Result<ReconcileResult, RuntimeSchedulingError> {
        let spec = ComputeSpec {
            cpu: resource.spec.cpu,
            memory_mb: resource.spec.memory_mb,
            image: "runtime:latest".to_string(),
            environment: vec![],
            region: "us-east-1".to_string(),
        };

        let handle = self
            .compute_provider
            .schedule(&spec)
            .await
            .map_err(|e| RuntimeSchedulingError::Provider(e.to_string()))?;

        self.transition_phase(resource, RuntimeSchedulingPhase::Scheduled)
            .await?;

        Ok(ReconcileResult::Ok)
    }

    async fn reconcile_scheduled(
        &self,
        resource: Arc<RuntimeSchedulingResource>,
    ) -> Result<ReconcileResult, RuntimeSchedulingError> {
        Ok(ReconcileResult::Ok)
    }

    async fn reconcile_scaling(
        &self,
        resource: Arc<RuntimeSchedulingResource>,
    ) -> Result<ReconcileResult, RuntimeSchedulingError> {
        self.transition_phase(resource, RuntimeSchedulingPhase::Scheduled)
            .await?;

        Ok(ReconcileResult::Ok)
    }

    async fn reconcile_deletion(
        &self,
        resource: Arc<RuntimeSchedulingResource>,
    ) -> Result<ReconcileResult, RuntimeSchedulingError> {
        if let Some(ref handle) = resource.compute_handle {
            self.compute_provider
                .terminate(handle)
                .await
                .map_err(|e| RuntimeSchedulingError::Provider(e.to_string()))?;
        }

        Ok(ReconcileResult::Ok)
    }

    async fn transition_phase(
        &self,
        _resource: Arc<RuntimeSchedulingResource>,
        _new_phase: RuntimeSchedulingPhase,
    ) -> Result<(), RuntimeSchedulingError> {
        Ok(())
    }
}
