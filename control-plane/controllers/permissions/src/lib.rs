//! Permissions controller — manages ACL records, policy attachments, and token scopes.
//!
//! Phase 1 controller: starts before resource controllers.

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

/// Permissions error types.
#[derive(Debug, Error)]
pub enum PermissionsError {
    #[error("permission not found: {0}")]
    NotFound(String),
    #[error("permission already exists: {0}")]
    AlreadyExists(String),
    #[error("persistence error: {0}")]
    Persistence(String),
    #[error("invalid spec: {0}")]
    InvalidSpec(String),
}

/// Permission specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionSpec {
    pub grantee: String,
    pub resource_id: ResourceId,
    pub scope: String,
}

/// Permission resource.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionResource {
    pub id: ResourceId,
    pub version: u64,
    pub spec: PermissionSpec,
    pub phase: PermissionPhase,
    pub finalizers: Vec<String>,
    pub deletion_requested: bool,
    pub owner_refs: Vec<OwnerReference>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Resource for PermissionResource {
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

/// Permission phase.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PermissionPhase {
    Pending,
    Granted,
    Revoked,
}

/// Permissions controller.
pub struct PermissionsController {
    store: Arc<dyn StateStore>,
    event_bus: Arc<dyn EventBus>,
}

impl PermissionsController {
    pub fn new(store: Arc<dyn StateStore>, event_bus: Arc<dyn EventBus>) -> Self {
        Self { store, event_bus }
    }
}

#[async_trait]
impl Controller for PermissionsController {
    type Resource = PermissionResource;
    type Error = PermissionsError;

    async fn reconcile(
        &self,
        resource: Arc<Self::Resource>,
        _ctx: ReconcileContext,
    ) -> Result<ReconcileResult, Self::Error> {
        tracing::info!(
            resource_id = %resource.id.as_str(),
            phase = ?resource.phase,
            "reconciling permission"
        );

        if resource.deletion_requested {
            return self.reconcile_deletion(resource).await;
        }

        match resource.phase {
            PermissionPhase::Pending => self.reconcile_pending(resource).await,
            PermissionPhase::Granted => Ok(ReconcileResult::Ok),
            PermissionPhase::Revoked => Ok(ReconcileResult::Ok),
        }
    }

    fn error_policy(
        &self,
        _resource: Arc<Self::Resource>,
        error: &Self::Error,
        _ctx: ReconcileContext,
    ) -> ErrorPolicy {
        match error {
            PermissionsError::Persistence(_) => ErrorPolicy::Backoff {
                initial: Duration::from_secs(1),
                multiplier: 1.5,
                max: Duration::from_secs(60),
                jitter: 0.1,
            },
            PermissionsError::InvalidSpec(_) => ErrorPolicy::Discard,
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

impl PermissionsController {
    async fn reconcile_pending(
        &self,
        resource: Arc<PermissionResource>,
    ) -> Result<ReconcileResult, PermissionsError> {
        // Grant permission
        self.transition_phase(resource, PermissionPhase::Granted)
            .await?;

        Ok(ReconcileResult::Ok)
    }

    async fn reconcile_deletion(
        &self,
        resource: Arc<PermissionResource>,
    ) -> Result<ReconcileResult, PermissionsError> {
        self.transition_phase(resource, PermissionPhase::Revoked)
            .await?;

        Ok(ReconcileResult::Ok)
    }

    async fn transition_phase(
        &self,
        _resource: Arc<PermissionResource>,
        _new_phase: PermissionPhase,
    ) -> Result<(), PermissionsError> {
        Ok(())
    }
}
