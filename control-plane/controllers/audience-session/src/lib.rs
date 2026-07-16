//! Audience session controller — manages per-session audience context and identity binding.
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

/// Audience session error types.
#[derive(Debug, Error)]
pub enum AudienceSessionError {
    #[error("audience session not found: {0}")]
    NotFound(String),
    #[error("persistence error: {0}")]
    Persistence(String),
    #[error("invalid spec: {0}")]
    InvalidSpec(String),
}

/// Audience session specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudienceSessionSpec {
    pub session_id: ResourceId,
    pub audience_id: String,
    pub identity_binding: serde_json::Value,
}

/// Audience session resource.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudienceSessionResource {
    pub id: ResourceId,
    pub version: u64,
    pub spec: AudienceSessionSpec,
    pub phase: AudienceSessionPhase,
    pub finalizers: Vec<String>,
    pub deletion_requested: bool,
    pub owner_refs: Vec<OwnerReference>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Resource for AudienceSessionResource {
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

/// Audience session phase.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AudienceSessionPhase {
    Pending,
    Bound,
    Failed,
}

/// Audience session controller.
pub struct AudienceSessionController {
    store: Arc<dyn StateStore>,
    event_bus: Arc<dyn EventBus>,
}

impl AudienceSessionController {
    pub fn new(store: Arc<dyn StateStore>, event_bus: Arc<dyn EventBus>) -> Self {
        Self { store, event_bus }
    }
}

#[async_trait]
impl Controller for AudienceSessionController {
    type Resource = AudienceSessionResource;
    type Error = AudienceSessionError;

    async fn reconcile(
        &self,
        resource: Arc<Self::Resource>,
        _ctx: ReconcileContext,
    ) -> Result<ReconcileResult, Self::Error> {
        tracing::info!(
            resource_id = %resource.id.as_str(),
            phase = ?resource.phase,
            "reconciling audience session"
        );

        match resource.phase {
            AudienceSessionPhase::Pending => self.reconcile_pending(resource).await,
            AudienceSessionPhase::Bound => Ok(ReconcileResult::Ok),
            AudienceSessionPhase::Failed => Ok(ReconcileResult::Ok),
        }
    }

    fn error_policy(
        &self,
        _resource: Arc<Self::Resource>,
        error: &Self::Error,
        _ctx: ReconcileContext,
    ) -> ErrorPolicy {
        match error {
            AudienceSessionError::Persistence(_) => ErrorPolicy::Backoff {
                initial: Duration::from_secs(1),
                multiplier: 1.5,
                max: Duration::from_secs(60),
                jitter: 0.1,
            },
            AudienceSessionError::InvalidSpec(_) => ErrorPolicy::Discard,
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

impl AudienceSessionController {
    async fn reconcile_pending(
        &self,
        resource: Arc<AudienceSessionResource>,
    ) -> Result<ReconcileResult, AudienceSessionError> {
        // Bind audience identity to session
        self.transition_phase(resource, AudienceSessionPhase::Bound)
            .await?;

        Ok(ReconcileResult::Ok)
    }

    async fn transition_phase(
        &self,
        _resource: Arc<AudienceSessionResource>,
        _new_phase: AudienceSessionPhase,
    ) -> Result<(), AudienceSessionError> {
        Ok(())
    }
}
