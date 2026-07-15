use crate::r#trait::secret::*;
use crate::r#trait::ProviderError;
use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use std::time::Duration;

pub struct MockSecretProvider {
    pub secrets: Arc<Mutex<HashMap<SecretKey, SecretValue>>>,
}

impl MockSecretProvider {
    pub fn new() -> Self {
        Self {
            secrets: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[async_trait]
impl SecretProvider for MockSecretProvider {
    async fn get(&self, key: &SecretKey) -> Result<SecretValue, ProviderError> {
        let map = self.secrets.lock().await;
        map.get(key).cloned().ok_or(ProviderError::NotFound)
    }

    async fn set(&self, key: &SecretKey, value: SecretValue, _ttl: Option<Duration>) -> Result<(), ProviderError> {
        self.secrets.lock().await.insert(key.clone(), value);
        Ok(())
    }

    async fn rotate(&self, key: &SecretKey) -> Result<SecretValue, ProviderError> {
        let new_val = format!("{}-rotated", uuid::Uuid::new_v4());
        self.set(key, new_val.clone(), None).await?;
        Ok(new_val)
    }

    async fn revoke(&self, key: &SecretKey) -> Result<(), ProviderError> {
        self.secrets.lock().await.remove(key);
        Ok(())
    }

    async fn health_check(&self) -> Result<(), ProviderError> {
        Ok(())
    }
}
