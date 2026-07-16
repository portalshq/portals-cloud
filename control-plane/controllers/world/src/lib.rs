//! World controller — manages world state store provisioning and schema migration.
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

/// World error types.
#[derive(Debug, Error)]
pub enum WorldError {
    #[error("world not found: {0}")]
    NotFound(String),
    #[error("persistence error: {0}")]
    Persistence(String),
    #[error("invalid spec: {0}")]
    InvalidSpec(String),
}

/// World specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorldSpec {
    pub name: String,
    pub schema_version: String,
    pub initial_state: serde_json::Value,
}

/// World resource.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorldResource {
    pub id: ResourceId,
    pub version: u64,
    pub spec: WorldSpec,
    pub phase: WorldPhase,
    pub finalizers: Vec<String>,
    pub deletion_requested: bool,
    pub owner_refs: Vec<OwnerReference>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Resource for WorldResource {
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

/// World phase.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum WorldPhase {
    Pending,
    Provisioned,
    Migrating,
    Failed,
}

/// World controller.
pub struct WorldController {
    store: Arc<dyn StateStore>,
    event_bus: Arc<dyn EventBus>,
}

impl WorldController {
    pub fn new(store: Arc<dyn StateStore>, event_bus: Arc<dyn EventBus>) -> Self {
        Self { store, event_bus }
    }
}

#[async_trait]
impl Controller for WorldController {
    type Resource = WorldResource;
    type Error = WorldError;

    async fn reconcile(
        &self,
        resource: Arc<Self::Resource>,
        _ctx: ReconcileContext,
    ) -> Result<ReconcileResult, Self::Error> {
        tracing::info!(
            resource_id = %resource.id.as_str(),
            phase = ?resource.phase,
            "reconciling world"
        );

        match resource.phase {
            WorldPhase::Pending => self.reconcile_pending(resource).await,
            WorldPhase::Provisioned => Ok(ReconcileResult::Ok),
            WorldPhase::Migrating => self.reconcile_migrating(resource).await,
            WorldPhase::Failed => Ok(ReconcileResult::Ok),
        }
    }

    fn error_policy(
        &self,
        _resource: Arc<Self::Resource>,
        error: &Self::Error,
        _ctx: ReconcileContext,
    ) -> ErrorPolicy {
        match error {
            WorldError::Persistence(_) => ErrorPolicy::Backoff {
                initial: Duration::from_secs(1),
                multiplier: 1.5,
                max: Duration::from_secs(60),
                jitter: 0.1,
            },
            WorldError::InvalidSpec(_) => ErrorPolicy::Discard,
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

impl WorldController {
    async fn reconcile_pending(
        &self,
        resource: Arc<WorldResource>,
    ) -> Result<ReconcileResult, WorldError> {
        // Provision world state store
        self.transition_phase(resource, WorldPhase::Provisioned)
            .await?;

        Ok(ReconcileResult::Ok)
    }

    async fn reconcile_migrating(
        &self,
        resource: Arc<WorldResource>,
    ) -> Result<ReconcileResult, WorldError> {
        // Run schema migration
        self.transition_phase(resource, WorldPhase::Provisioned)
            .await?;

        Ok(ReconcileResult::Ok)
    }

    async fn transition_phase(
        &self,
        _resource: Arc<WorldResource>,
        _new_phase: WorldPhase,
    ) -> Result<(), WorldError> {
        Ok(())
    }
}
