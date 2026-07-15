use models::{Controller, ErrorPolicy, HealthError, ReconcileContext, ReconcileResult, Resource, ResourceId, ResourceKind};
use persistence::{PostgresStateStore, StateStore};
use std::sync::Arc;
use thiserror::Error;
use tracing::{debug, error, info};

#[derive(Debug, Error)]
pub enum OrganizationError {
    #[error("organization has active resources: {0}")]
    HasActiveResources(String),
    #[error("database error: {0}")]
    Database(String),
    #[error("finalization failed: {0}")]
    Finalization(String),
}

#[derive(Debug, Clone)]
pub struct OrganizationResource {
    pub id: ResourceId,
    pub version: u64,
    pub spec: OrganizationSpec,
    pub finalizers: Vec<String>,
    pub deletion_requested: bool,
    pub owner_refs: Vec<models::OwnerReference>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct OrganizationSpec {
    pub name: String,
    pub slug: String,
}

impl Resource for OrganizationResource {
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

    fn owner_refs(&self) -> &[models::OwnerReference] {
        &self.owner_refs
    }
}

pub struct OrganizationController {
    pub store: Arc<PostgresStateStore>,
}

impl OrganizationController {
    pub async fn finalize_organization_deletion(&self, org_id: &ResourceId) -> Result<(), OrganizationError> {
        // Check if organization has any repositories
        let repositories = self.store.list_resources(ResourceKind::Repository.as_str()).await
            .map_err(|e| OrganizationError::Database(e.to_string()))?;
        
        for repo_row in repositories {
            let repo_spec: serde_json::Value = repo_row.spec;
            if let Some(org_id_in_spec) = repo_spec.get("organization").and_then(|v| v.as_str()) {
                if org_id_in_spec == org_id.as_str() {
                    return Err(OrganizationError::HasActiveResources("repositories".to_string()));
                }
            }
        }

        // Check for any workflow steps
        let workflows = self.store.list_resources("Workflow").await
            .map_err(|e| OrganizationError::Database(e.to_string()))?;
        if !workflows.is_empty() {
            return Err(OrganizationError::HasActiveResources("workflows".to_string()));
        }

        // Delete the organization resource
        self.store.delete_resource(ResourceKind::Organization.as_str(), org_id).await
            .map_err(|e| OrganizationError::Database(e.to_string()))?;
        
        info!(id = %org_id.as_str(), "organization finalized and deleted");
        Ok(())
    }
}

#[async_trait::async_trait]
impl Controller for OrganizationController {
    type Resource = OrganizationResource;
    type Error = OrganizationError;

    async fn reconcile(&self, resource: Arc<Self::Resource>, _ctx: ReconcileContext) -> Result<ReconcileResult, Self::Error> {
        debug!(id = %resource.id().as_str(), "reconciling organization");

        if resource.deletion_requested() {
            // Check if finalizer is present
            if resource.finalizers().contains(&"org-cleanup".to_string()) {
                info!(id = %resource.id().as_str(), "organization deletion requested, running finalizer");
                
                // Run finalization logic
                if let Err(e) = self.finalize_organization_deletion(&resource.id).await {
                    error!(error = %e, id = %resource.id().as_str(), "failed to finalize organization deletion");
                    return Err(OrganizationError::Finalization(e.to_string()));
                }
                
                // Remove finalizer
                let updated_finalizers: Vec<String> = resource.finalizers()
                    .iter()
                    .filter(|f| *f != "org-cleanup")
                    .cloned()
                    .collect();
                
                self.store.set_finalizers(ResourceKind::Organization.as_str(), &resource.id, &updated_finalizers).await
                    .map_err(|e| OrganizationError::Database(e.to_string()))?;
                
                info!(id = %resource.id().as_str(), "organization finalizer removed");
            }
        }

        Ok(ReconcileResult::Ok)
    }

    fn error_policy(&self, _resource: Arc<Self::Resource>, _error: &Self::Error, _ctx: ReconcileContext) -> ErrorPolicy {
        ErrorPolicy::Backoff {
            initial: std::time::Duration::from_secs(5),
            multiplier: 2.0,
            max: std::time::Duration::from_secs(300),
            jitter: 0.1,
        }
    }

    fn finalizers(&self) -> &[&'static str] {
        &["org-cleanup"]
    }

    async fn health_check(&self) -> Result<(), HealthError> {
        self.store.ping().await.map_err(|e| HealthError::Unhealthy(e.to_string()))
    }
}
