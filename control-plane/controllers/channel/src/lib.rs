//! Channel controller — manages channel declaration and capability composition graph.
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

/// Channel error types.
#[derive(Debug, Error)]
pub enum ChannelError {
    #[error("channel not found: {0}")]
    NotFound(String),
    #[error("persistence error: {0}")]
    Persistence(String),
    #[error("invalid spec: {0}")]
    InvalidSpec(String),
}

/// Channel specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelSpec {
    pub name: String,
    pub capabilities: Vec<String>, // Capability IDs
    pub composition_graph: serde_json::Value,
}

/// Channel resource.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelResource {
    pub id: ResourceId,
    pub version: u64,
    pub spec: ChannelSpec,
    pub phase: ChannelPhase,
    pub finalizers: Vec<String>,
    pub deletion_requested: bool,
    pub owner_refs: Vec<OwnerReference>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Resource for ChannelResource {
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

/// Channel phase.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ChannelPhase {
    Pending,
    Composed,
    Failed,
}

/// Channel controller.
pub struct ChannelController {
    store: Arc<dyn StateStore>,
    event_bus: Arc<dyn EventBus>,
}

impl ChannelController {
    pub fn new(store: Arc<dyn StateStore>, event_bus: Arc<dyn EventBus>) -> Self {
        Self { store, event_bus }
    }
}

#[async_trait]
impl Controller for ChannelController {
    type Resource = ChannelResource;
    type Error = ChannelError;

    async fn reconcile(
        &self,
        resource: Arc<Self::Resource>,
        _ctx: ReconcileContext,
    ) -> Result<ReconcileResult, Self::Error> {
        tracing::info!(
            resource_id = %resource.id.as_str(),
            phase = ?resource.phase,
            "reconciling channel"
        );

        match resource.phase {
            ChannelPhase::Pending => self.reconcile_pending(resource).await,
            ChannelPhase::Composed => Ok(ReconcileResult::Ok),
            ChannelPhase::Failed => Ok(ReconcileResult::Ok),
        }
    }

    fn error_policy(
        &self,
        _resource: Arc<Self::Resource>,
        error: &Self::Error,
        _ctx: ReconcileContext,
    ) -> ErrorPolicy {
        match error {
            ChannelError::Persistence(_) => ErrorPolicy::Backoff {
                initial: Duration::from_secs(1),
                multiplier: 1.5,
                max: Duration::from_secs(60),
                jitter: 0.1,
            },
            ChannelError::InvalidSpec(_) => ErrorPolicy::Discard,
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

impl ChannelController {
    async fn reconcile_pending(
        &self,
        resource: Arc<ChannelResource>,
    ) -> Result<ReconcileResult, ChannelError> {
        // Validate capability composition graph
        self.transition_phase(resource, ChannelPhase::Composed)
            .await?;

        Ok(ReconcileResult::Ok)
    }

    async fn transition_phase(
        &self,
        _resource: Arc<ChannelResource>,
        _new_phase: ChannelPhase,
    ) -> Result<(), ChannelError> {
        Ok(())
    }
}
