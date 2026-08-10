use async_trait::async_trait;
use models::ResourceId;
use events::PlatformEvent;
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::future::Future;
use std::sync::Arc;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum StoreError {
    #[error("Version mismatch: resource modified concurrently")]
    StaleVersion,
    #[error("Not found")]
    NotFound,
    #[error("Database error: {0}")]
    Database(String),
}

#[async_trait]
pub trait StoreTransaction: Send + Sync {
    async fn set_observed(&self, id: &ResourceId, state: &serde_json::Value, version: u64) -> Result<(), StoreError>;
    async fn set_workflow_id(&self, id: &ResourceId, workflow_id: &str, version: u64) -> Result<(), StoreError>;
    async fn enqueue_outbox_event(&self, event: PlatformEvent) -> Result<(), StoreError>;
}

#[async_trait]
pub trait StateStore: Send + Sync {
    async fn set_observed_versioned<T: Serialize + Send + Sync>(
        &self,
        id: &ResourceId,
        state: &T,
        version: u64,
    ) -> Result<u64, StoreError>;

    async fn transaction<F, Fut, T>(&self, f: F) -> Result<T, StoreError>
    where
        F: FnOnce(Arc<dyn StoreTransaction>) -> Fut + Send,
        Fut: Future<Output = Result<T, StoreError>> + Send,
        T: Send;

    async fn get_observed<T: DeserializeOwned>(&self, id: &ResourceId) -> Result<Option<T>, StoreError>;
    async fn get_handle(&self, id: &ResourceId) -> Result<serde_json::Value, StoreError>;
    async fn remove_observed(&self, id: &ResourceId) -> Result<(), StoreError>;
    async fn remove_finalizer(&self, id: &ResourceId, version: u64, finalizer: &str) -> Result<(), StoreError>;
    async fn set_finalizers(&self, kind: &str, id: &ResourceId, finalizers: &[String]) -> Result<(), StoreError>;
    async fn exists(&self, kind: models::ResourceKind, id: &ResourceId) -> Result<bool, StoreError>;
    async fn mark_deletion_requested(&self, id: &ResourceId) -> Result<(), StoreError>;
    async fn workflow_has_owner(&self, workflow_id: &str) -> Result<bool, StoreError>;
    async fn ping(&self) -> Result<(), StoreError>;
}
