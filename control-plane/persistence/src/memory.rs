use crate::state_store::{StateStore, StoreError, StoreTransaction};
use async_trait::async_trait;
use models::{ResourceId, ResourceKind};
use events::PlatformEvent;
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::collections::HashMap;
use std::future::Future;
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Default)]
pub struct MockStateStore {
    state: Arc<Mutex<HashMap<String, (serde_json::Value, u64)>>>,
    finalizers: Arc<Mutex<HashMap<String, Vec<String>>>>,
    workflows: Arc<Mutex<HashMap<String, String>>>,
    outbox: Arc<Mutex<Vec<PlatformEvent>>>,
}

impl MockStateStore {
    pub fn new() -> Self {
        Self::default()
    }
}

pub struct MockTransaction {
    store: Arc<MockStateStore>,
}

#[async_trait]
impl StoreTransaction for MockTransaction {
    async fn set_observed(&self, id: &ResourceId, state: &serde_json::Value, version: u64) -> Result<(), StoreError> {
        let mut map = self.store.state.lock().await;
        if let Some((_, current_v)) = map.get(id.as_str()) {
            if *current_v != version {
                return Err(StoreError::StaleVersion);
            }
        }
        map.insert(id.as_str().to_string(), (state.clone(), version + 1));
        Ok(())
    }

    async fn set_workflow_id(&self, id: &ResourceId, workflow_id: &str, _version: u64) -> Result<(), StoreError> {
        self.store.workflows.lock().await.insert(workflow_id.to_string(), id.as_str().to_string());
        Ok(())
    }

    async fn enqueue_outbox_event(&self, event: PlatformEvent) -> Result<(), StoreError> {
        self.store.outbox.lock().await.push(event);
        Ok(())
    }
}

#[async_trait]
impl StateStore for MockStateStore {
    async fn set_observed_versioned<T: Serialize + Send + Sync>(
        &self,
        id: &ResourceId,
        state: &T,
        version: u64,
    ) -> Result<u64, StoreError> {
        let val = serde_json::to_value(state).map_err(|_| StoreError::Database("Serialize error".into()))?;
        let mut map = self.state.lock().await;
        if let Some((_, current_v)) = map.get(id.as_str()) {
            if *current_v != version {
                return Err(StoreError::StaleVersion);
            }
        }
        let next_v = version + 1;
        map.insert(id.as_str().to_string(), (val, next_v));
        Ok(next_v)
    }

    async fn transaction<F, Fut, T>(&self, f: F) -> Result<T, StoreError>
    where
        F: FnOnce(Arc<dyn StoreTransaction>) -> Fut + Send,
        Fut: Future<Output = Result<T, StoreError>> + Send,
    {
        let tx = Arc::new(MockTransaction { store: Arc::new(Self {
            state: self.state.clone(),
            finalizers: self.finalizers.clone(),
            workflows: self.workflows.clone(),
            outbox: self.outbox.clone(),
        })});
        f(tx).await
    }

    async fn get_observed<T: DeserializeOwned>(&self, id: &ResourceId) -> Result<Option<T>, StoreError> {
        let map = self.state.lock().await;
        if let Some((val, _)) = map.get(id.as_str()) {
            Ok(Some(serde_json::from_value(val.clone()).map_err(|_| StoreError::Database("Deserialize error".into()))?))
        } else {
            Ok(None)
        }
    }

    async fn get_handle(&self, id: &ResourceId) -> Result<serde_json::Value, StoreError> {
        let map = self.state.lock().await;
        map.get(id.as_str()).map(|(v, _)| v.clone()).ok_or(StoreError::NotFound)
    }

    async fn remove_observed(&self, id: &ResourceId) -> Result<(), StoreError> {
        self.state.lock().await.remove(id.as_str());
        Ok(())
    }

    async fn remove_finalizer(&self, id: &ResourceId, _version: u64, finalizer: &str) -> Result<(), StoreError> {
        let mut map = self.finalizers.lock().await;
        if let Some(list) = map.get_mut(id.as_str()) {
            list.retain(|f| f != finalizer);
        }
        Ok(())
    }

    async fn set_finalizers(&self, _kind: &str, id: &ResourceId, finalizers: &[String]) -> Result<(), StoreError> {
        let mut map = self.finalizers.lock().await;
        map.insert(id.as_str().to_string(), finalizers.to_vec());
        Ok(())
    }

    async fn exists(&self, _kind: ResourceKind, id: &ResourceId) -> Result<bool, StoreError> {
        Ok(self.state.lock().await.contains_key(id.as_str()))
    }

    async fn mark_deletion_requested(&self, _id: &ResourceId) -> Result<(), StoreError> {
        Ok(())
    }

    async fn workflow_has_owner(&self, workflow_id: &str) -> Result<bool, StoreError> {
        Ok(self.workflows.lock().await.contains_key(workflow_id))
    }

    async fn ping(&self) -> Result<(), StoreError> {
        Ok(())
    }
}
