use models::{Controller, ErrorPolicy, HealthError, ReconcileContext, ReconcileResult, Resource, ResourceId, OwnerReference};
use async_trait::async_trait;
use events::PlatformEvent;
use persistence::{PostgresStateStore, state_store::StateStore};
use providers::r#trait::repository::{RepositoryHandle, RepositoryProvider, RepositorySpec};
use std::sync::Arc;
use std::time::Duration;
use thiserror::Error;

const REPO_FINALIZER: &str = "lorecloud.io/repository-cleanup";

#[derive(Debug, Clone)]
pub struct RepositoryResource {
    pub id: ResourceId,
    pub version: u64,
    pub spec: RepositorySpec,
    pub finalizers: Vec<String>,
    pub deletion_requested: bool,
    pub owner_refs: Vec<OwnerReference>,
}

impl Resource for RepositoryResource {
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

#[derive(Debug, Error)]
pub enum RepositoryError {
    #[error("Provider error: {0}")]
    Provider(#[from] providers::r#trait::ProviderError),
    #[error("Persistence error: {0}")]
    Persistence(#[from] persistence::state_store::StoreError),
    #[error("Quota exceeded: {0}")]
    QuotaExceeded(String),
    #[error("Invalid spec: {0}")]
    InvalidSpec(String),
}

pub struct RepositoryController {
    pub store: Arc<PostgresStateStore>,
    pub provider: Arc<dyn RepositoryProvider>,
}

#[async_trait]
impl Controller for RepositoryController {
    type Resource = RepositoryResource;
    type Error = RepositoryError;

    async fn reconcile(
        &self,
        resource: Arc<Self::Resource>,
        _ctx: ReconcileContext,
    ) -> Result<ReconcileResult, Self::Error> {
        if resource.deletion_requested() {
            return self.reconcile_deletion(resource).await;
        }

        let handle_result = self.store.get_handle(&resource.id).await;

        let handle = match handle_result {
            Ok(val) => serde_json::from_value::<RepositoryHandle>(val).ok(),
            Err(persistence::state_store::StoreError::NotFound) => None,
            Err(e) => return Err(RepositoryError::Persistence(e)),
        };

        if handle.is_none() {
            let new_handle = self.provider.provision(&resource.spec).await?;
            let version = resource.version();
            let id = resource.id.clone();
            let handle_json = serde_json::to_value(&new_handle).unwrap();

            self.store
                .transaction(|tx| {
                    let id = id.clone();
                    let handle_json = handle_json.clone();
                    async move {
                        tx.set_observed(&id, &handle_json, version).await?;
                        tx.enqueue_outbox_event(PlatformEvent::RepositoryProvisioned {
                            id: id.as_str().to_string(),
                            provisioned_at: chrono::Utc::now(),
                        })
                        .await?;
                        Ok(())
                    }
                })
                .await?;
        }

        Ok(ReconcileResult::Ok)
    }

    fn error_policy(
        &self,
        _resource: Arc<Self::Resource>,
        error: &Self::Error,
        ctx: ReconcileContext,
    ) -> ErrorPolicy {
        match error {
            RepositoryError::Provider(_) => {
                if ctx.attempt > 5 {
                    ErrorPolicy::ExtendedBackoff {
                        max: Duration::from_secs(900),
                    }
                } else {
                    ErrorPolicy::Backoff {
                        initial: Duration::from_secs(5),
                        multiplier: 2.0,
                        max: Duration::from_secs(300),
                        jitter: 0.2,
                    }
                }
            }
            RepositoryError::Persistence(_) => ErrorPolicy::Backoff {
                initial: Duration::from_secs(1),
                multiplier: 1.5,
                max: Duration::from_secs(60),
                jitter: 0.1,
            },
            RepositoryError::QuotaExceeded(_) => ErrorPolicy::Discard,
            RepositoryError::InvalidSpec(_) => ErrorPolicy::Discard,
        }
    }

    fn finalizers(&self) -> &[&'static str] {
        &[REPO_FINALIZER]
    }

    async fn health_check(&self) -> Result<(), HealthError> {
        self.provider
            .health_check()
            .await
            .map_err(|e| HealthError::Unhealthy(e.to_string()))?;
        self.store
            .ping()
            .await
            .map_err(|e| HealthError::Unhealthy(e.to_string()))?;
        Ok(())
    }
}

impl RepositoryController {
    async fn reconcile_deletion(
        &self,
        resource: Arc<RepositoryResource>,
    ) -> Result<ReconcileResult, RepositoryError> {
        if !resource
            .finalizers()
            .contains(&REPO_FINALIZER.to_string())
        {
            return Ok(ReconcileResult::Ok);
        }

        if let Ok(handle_val) = self.store.get_handle(&resource.id).await {
            if let Ok(handle) = serde_json::from_value::<RepositoryHandle>(handle_val) {
                self.provider.deprovision(&handle).await?;
            }
        }

        self.store
            .remove_finalizer(&resource.id, resource.version(), REPO_FINALIZER)
            .await?;

        let id = resource.id.clone();
        self.store
            .transaction(|tx| {
                let id = id.clone();
                async move {
                    tx.enqueue_outbox_event(PlatformEvent::RepositoryDeleted {
                        id: id.as_str().to_string(),
                    })
                    .await?;
                    Ok(())
                }
            })
            .await?;

        Ok(ReconcileResult::Ok)
    }
}
