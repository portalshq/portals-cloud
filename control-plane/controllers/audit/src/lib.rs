//! Audit controller — manages audit log retention policy and access log aggregation.
//!
//! Phase 1 controller: cross-cutting audit logging.

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
use events::{EventBus, PlatformEvent, AuditEvent, AuditContext};

/// Audit error types.
#[derive(Debug, Error)]
pub enum AuditError {
    #[error("audit log not found: {0}")]
    NotFound(String),
    #[error("persistence error: {0}")]
    Persistence(String),
}

/// Audit log specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditLogSpec {
    pub retention_days: u32,
    pub resource_kind: ResourceKind,
}

/// Audit log resource.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditLogResource {
    pub id: ResourceId,
    pub version: u64,
    pub spec: AuditLogSpec,
    pub phase: AuditPhase,
    pub finalizers: Vec<String>,
    pub deletion_requested: bool,
    pub owner_refs: Vec<OwnerReference>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Resource for AuditLogResource {
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

/// Audit phase.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AuditPhase {
    Active,
    RetentionExpired,
}

/// Audit controller.
pub struct AuditController {
    store: Arc<dyn StateStore>,
    event_bus: Arc<dyn EventBus>,
}

impl AuditController {
    pub fn new(store: Arc<dyn StateStore>, event_bus: Arc<dyn EventBus>) -> Self {
        Self { store, event_bus }
    }

    /// Publish an audit event.
    pub async fn publish_audit(&self, event: AuditEvent) -> Result<(), AuditError> {
        self.event_bus
            .publish(PlatformEvent::Audit { event })
            .await
            .map_err(|e| AuditError::Persistence(e.to_string()))?;
        Ok(())
    }
}

#[async_trait]
impl Controller for AuditController {
    type Resource = AuditLogResource;
    type Error = AuditError;

    async fn reconcile(
        &self,
        resource: Arc<Self::Resource>,
        _ctx: ReconcileContext,
    ) -> Result<ReconcileResult, Self::Error> {
        tracing::info!(
            resource_id = %resource.id.as_str(),
            phase = ?resource.phase,
            "reconciling audit log"
        );

        if resource.deletion_requested {
            return Ok(ReconcileResult::Ok);
        }

        match resource.phase {
            AuditPhase::Active => self.check_retention(resource).await,
            AuditPhase::RetentionExpired => Ok(ReconcileResult::Ok),
        }
    }

    fn error_policy(
        &self,
        _resource: Arc<Self::Resource>,
        error: &Self::Error,
        _ctx: ReconcileContext,
    ) -> ErrorPolicy {
        match error {
            AuditError::Persistence(_) => ErrorPolicy::Backoff {
                initial: Duration::from_secs(1),
                multiplier: 1.5,
                max: Duration::from_secs(60),
                jitter: 0.1,
            },
            _ => ErrorPolicy::Discard,
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

impl AuditController {
    async fn check_retention(
        &self,
        resource: Arc<AuditLogResource>,
    ) -> Result<ReconcileResult, AuditError> {
        // Check if retention period has expired
        let age = Utc::now().signed_duration_since(resource.created_at);
        if age.num_days() > resource.spec.retention_days as i64 {
            self.transition_phase(resource, AuditPhase::RetentionExpired)
                .await?;
        }

        Ok(ReconcileResult::Ok)
    }

    async fn transition_phase(
        &self,
        _resource: Arc<AuditLogResource>,
        _new_phase: AuditPhase,
    ) -> Result<(), AuditError> {
        Ok(())
    }
}
