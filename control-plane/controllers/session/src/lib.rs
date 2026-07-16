//! Session controller — manages session lifecycle: scheduling, start, drain, terminate.
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

/// Session error types.
#[derive(Debug, Error)]
pub enum SessionError {
    #[error("session not found: {0}")]
    NotFound(String),
    #[error("persistence error: {0}")]
    Persistence(String),
    #[error("invalid spec: {0}")]
    InvalidSpec(String),
}

/// Session specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSpec {
    pub channel_id: ResourceId,
    pub scheduled_start: DateTime<Utc>,
    pub scheduled_end: DateTime<Utc>,
    pub max_audience: u32,
}

/// Session resource.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionResource {
    pub id: ResourceId,
    pub version: u64,
    pub spec: SessionSpec,
    pub phase: SessionPhase,
    pub finalizers: Vec<String>,
    pub deletion_requested: bool,
    pub owner_refs: Vec<OwnerReference>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Resource for SessionResource {
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

/// Session phase.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SessionPhase {
    Scheduled,
    Starting,
    Running,
    Draining,
    Terminated,
    Failed,
}

/// Session controller.
pub struct SessionController {
    store: Arc<dyn StateStore>,
    event_bus: Arc<dyn EventBus>,
}

impl SessionController {
    pub fn new(store: Arc<dyn StateStore>, event_bus: Arc<dyn EventBus>) -> Self {
        Self { store, event_bus }
    }
}

#[async_trait]
impl Controller for SessionController {
    type Resource = SessionResource;
    type Error = SessionError;

    async fn reconcile(
        &self,
        resource: Arc<Self::Resource>,
        _ctx: ReconcileContext,
    ) -> Result<ReconcileResult, Self::Error> {
        tracing::info!(
            resource_id = %resource.id.as_str(),
            phase = ?resource.phase,
            "reconciling session"
        );

        match resource.phase {
            SessionPhase::Scheduled => self.reconcile_scheduled(resource).await,
            SessionPhase::Starting => self.reconcile_starting(resource).await,
            SessionPhase::Running => self.reconcile_running(resource).await,
            SessionPhase::Draining => self.reconcile_draining(resource).await,
            SessionPhase::Terminated => Ok(ReconcileResult::Ok),
            SessionPhase::Failed => Ok(ReconcileResult::Ok),
        }
    }

    fn error_policy(
        &self,
        _resource: Arc<Self::Resource>,
        error: &Self::Error,
        _ctx: ReconcileContext,
    ) -> ErrorPolicy {
        match error {
            SessionError::Persistence(_) => ErrorPolicy::Backoff {
                initial: Duration::from_secs(1),
                multiplier: 1.5,
                max: Duration::from_secs(60),
                jitter: 0.1,
            },
            SessionError::InvalidSpec(_) => ErrorPolicy::Discard,
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

impl SessionController {
    async fn reconcile_scheduled(
        &self,
        resource: Arc<SessionResource>,
    ) -> Result<ReconcileResult, SessionError> {
        // Check if scheduled start time has arrived
        if Utc::now() >= resource.spec.scheduled_start {
            self.event_bus
                .publish(PlatformEvent::SessionScheduled {
                    session_id: resource.id.clone(),
                    channel_id: resource.spec.channel_id.clone(),
                })
                .await
                .map_err(|e| SessionError::Persistence(e.to_string()))?;

            self.transition_phase(resource, SessionPhase::Starting)
                .await?;
        }

        Ok(ReconcileResult::RequeueAfter(Duration::from_secs(30)))
    }

    async fn reconcile_starting(
        &self,
        resource: Arc<SessionResource>,
    ) -> Result<ReconcileResult, SessionError> {
        self.event_bus
            .publish(PlatformEvent::SessionStarted {
                session_id: resource.id.clone(),
            })
            .await
            .map_err(|e| SessionError::Persistence(e.to_string()))?;

        self.transition_phase(resource, SessionPhase::Running)
            .await?;

        Ok(ReconcileResult::Ok)
    }

    async fn reconcile_running(
        &self,
        resource: Arc<SessionResource>,
    ) -> Result<ReconcileResult, SessionError> {
        // Check if scheduled end time has arrived
        if Utc::now() >= resource.spec.scheduled_end {
            self.transition_phase(resource, SessionPhase::Draining)
                .await?;
        }

        Ok(ReconcileResult::RequeueAfter(Duration::from_secs(30)))
    }

    async fn reconcile_draining(
        &self,
        resource: Arc<SessionResource>,
    ) -> Result<ReconcileResult, SessionError> {
        self.event_bus
            .publish(PlatformEvent::SessionDrained {
                session_id: resource.id.clone(),
            })
            .await
            .map_err(|e| SessionError::Persistence(e.to_string()))?;

        self.transition_phase(resource, SessionPhase::Terminated)
            .await?;

        Ok(ReconcileResult::Ok)
    }

    async fn transition_phase(
        &self,
        _resource: Arc<SessionResource>,
        _new_phase: SessionPhase,
    ) -> Result<(), SessionError> {
        Ok(())
    }
}
