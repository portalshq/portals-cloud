//! Billing controller — manages billing anchors and usage metering.
//!
//! STUB: Migrated from old control plane, compartmentalized for future integration.
//! Currently provides placeholder structure for billing integration functionality.

use std::sync::Arc;
use std::time::Duration;
use async_trait::async_trait;
use thiserror::Error;
use chrono::{DateTime, Utc};

use models::{Controller, Resource, ResourceId, OwnerReference, ReconcileContext, ReconcileResult, ErrorPolicy, HealthError};

/// Billing error types.
#[derive(Debug, Error)]
pub enum BillingError {
    #[error("billing anchor not found: {0}")]
    NotFound(String),
    #[error("persistence error: {0}")]
    Persistence(String),
    #[error("invalid spec: {0}")]
    InvalidSpec(String),
}

/// Billing anchor specification.
#[derive(Debug, Clone)]
pub struct BillingAnchorSpec {
    pub organization_id: ResourceId,
    pub billing_plan: String,
    pub payment_method_id: String,
}

/// Billing anchor resource.
#[derive(Debug, Clone)]
pub struct BillingAnchorResource {
    pub id: ResourceId,
    pub version: u64,
    pub spec: BillingAnchorSpec,
    pub phase: BillingPhase,
    pub finalizers: Vec<String>,
    pub deletion_requested: bool,
    pub owner_refs: Vec<OwnerReference>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Resource for BillingAnchorResource {
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

/// Billing phase.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum BillingPhase {
    Pending,
    Anchored,
    Failed,
}

/// Billing controller.
/// STUB: Placeholder structure only - not yet implemented.
pub struct BillingController;

impl BillingController {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl Controller for BillingController {
    type Resource = BillingAnchorResource;
    type Error = BillingError;

    async fn reconcile(
        &self,
        resource: Arc<Self::Resource>,
        _ctx: ReconcileContext,
    ) -> Result<ReconcileResult, Self::Error> {
        tracing::info!(
            resource_id = %resource.id.as_str(),
            phase = ?resource.phase,
            "reconciling billing anchor (STUB - not implemented)"
        );
        Ok(ReconcileResult::Ok)
    }

    fn error_policy(
        &self,
        _resource: Arc<Self::Resource>,
        error: &Self::Error,
        _ctx: ReconcileContext,
    ) -> ErrorPolicy {
        match error {
            BillingError::Persistence(_) => ErrorPolicy::Backoff {
                initial: Duration::from_secs(1),
                multiplier: 1.5,
                max: Duration::from_secs(60),
                jitter: 0.1,
            },
            BillingError::InvalidSpec(_) => ErrorPolicy::Discard,
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
        Ok(())
    }
}

