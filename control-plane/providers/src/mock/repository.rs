use crate::r#trait::repository::*;
use crate::r#trait::ProviderError;
use async_trait::async_trait;
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct MockRepositoryProvider {
    pub healthy: bool,
    pub provisioned: Arc<Mutex<Vec<RepositoryHandle>>>,
}

impl MockRepositoryProvider {
    pub fn new() -> Self {
        Self {
            healthy: true,
            provisioned: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

#[async_trait]
impl RepositoryProvider for MockRepositoryProvider {
    async fn provision(&self, spec: &RepositorySpec) -> Result<RepositoryHandle, ProviderError> {
        if !self.healthy {
            return Err(ProviderError::ApiError("Mock provider is unhealthy".into()));
        }
        let handle = RepositoryHandle {
            bucket: format!("mock-bucket-{}", spec.name),
            prefix: "repo/".to_string(),
        };
        self.provisioned.lock().await.push(handle.clone());
        Ok(handle)
    }

    async fn deprovision(&self, handle: &RepositoryHandle) -> Result<(), ProviderError> {
        let mut list = self.provisioned.lock().await;
        list.retain(|h| h.bucket != handle.bucket);
        Ok(())
    }

    async fn describe(&self, _handle: &RepositoryHandle) -> Result<RepositoryStatus, ProviderError> {
        Ok(RepositoryStatus { ready: true })
    }

    async fn update(&self, _handle: &RepositoryHandle, _patch: &serde_json::Value) -> Result<(), ProviderError> {
        Ok(())
    }

    async fn health_check(&self) -> Result<(), ProviderError> {
        if self.healthy {
            Ok(())
        } else {
            Err(ProviderError::ApiError("Mock unhealthy".into()))
        }
    }

    async fn list_resources(&self) -> Result<Vec<RepositoryHandle>, ProviderError> {
        Ok(self.provisioned.lock().await.clone())
    }
}
