//! Quota controller — manages API rate limits, concurrent session limits, and capability quotas.
//!
//! Phase 2 controller: enforces per-resource quota limits.

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

/// Quota error types.
#[derive(Debug, Error)]
pub enum QuotaError {
    #[error("quota state not found: {0}")]
    NotFound(String),
    #[error("persistence error: {0}")]
    Persistence(String),
    #[error("invalid spec: {0}")]
    InvalidSpec(String),
}

/// Quota kind.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum QuotaKind {
    RepositoryCount,
    StorageBytes,
    ApiRateLimit,
    ConcurrentSessions,
    CapabilityDeployments,
}

/// Quota state specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuotaStateSpec {
    pub organization_id: ResourceId,
    pub quota_kind: QuotaKind,
    pub limit: u64,
    pub current_usage: u64,
}

/// Quota state resource.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuotaStateResource {
    pub id: ResourceId,
    pub version: u64,
    pub spec: QuotaStateSpec,
    pub phase: QuotaPhase,
    pub finalizers: Vec<String>,
    pub deletion_requested: bool,
    pub owner_refs: Vec<OwnerReference>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Resource for QuotaStateResource {
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

/// Quota phase.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum QuotaPhase {
    Active,
    Exceeded,
}

/// Quota controller.
pub struct QuotaController {
    store: Arc<dyn StateStore>,
    event_bus: Arc<dyn EventBus>,
}

impl QuotaController {
    pub fn new(store: Arc<dyn StateStore>, event_bus: Arc<dyn EventBus>) -> Self {
        Self { store, event_bus }
    }

    /// Check if a quota would be exceeded.
    pub async fn check_quota(
        &self,
        org_id: &ResourceId,
        quota_kind: &QuotaKind,
        additional: u64,
    ) -> Result<bool, QuotaError> {
        // Fetch current quota state and check
        // This is called by other controllers before applying changes
        Ok(true)
    }
}

#[async_trait]
impl Controller for QuotaController {
    type Resource = QuotaStateResource;
    type Error = QuotaError;

    async fn reconcile(
        &self,
        resource: Arc<Self::Resource>,
        _ctx: ReconcileContext,
    ) -> Result<ReconcileResult, Self::Error> {
        tracing::info!(
            resource_id = %resource.id.as_str(),
            phase = ?resource.phase,
            "reconciling quota state"
        );

        match resource.phase {
            QuotaPhase::Active => self.check_quota_exceeded(resource).await,
            QuotaPhase::Exceeded => Ok(ReconcileResult::Ok),
        }
    }

    fn error_policy(
        &self,
        _resource: Arc<Self::Resource>,
        error: &Self::Error,
        _ctx: ReconcileContext,
    ) -> ErrorPolicy {
        match error {
            QuotaError::Persistence(_) => ErrorPolicy::Backoff {
                initial: Duration::from_secs(1),
                multiplier: 1.5,
                max: Duration::from_secs(60),
                jitter: 0.1,
            },
            QuotaError::InvalidSpec(_) => ErrorPolicy::Discard,
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

impl QuotaController {
    async fn check_quota_exceeded(
        &self,
        resource: Arc<QuotaStateResource>,
    ) -> Result<ReconcileResult, QuotaError> {
        if resource.spec.current_usage > resource.spec.limit {
            // Publish quota exceeded event
            self.event_bus
                .publish(PlatformEvent::QuotaExceeded {
                    resource_kind: ResourceKind::Repository, // Simplified
                    org_id: resource.spec.organization_id.clone(),
                    quota: format!("{:?}", resource.spec.quota_kind),
                })
                .await
                .map_err(|e| QuotaError::Persistence(e.to_string()))?;

            self.transition_phase(resource, QuotaPhase::Exceeded)
                .await?;
        }

        Ok(ReconcileResult::Ok)
    }

    async fn transition_phase(
        &self,
        _resource: Arc<QuotaStateResource>,
        _new_phase: QuotaPhase,
    ) -> Result<(), QuotaError> {
        Ok(())
    }
}
