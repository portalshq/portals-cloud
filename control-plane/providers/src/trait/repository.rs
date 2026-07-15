use super::ProviderError;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepositorySpec {
    pub name: String,
    pub storage_tier: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepositoryHandle {
    pub bucket: String,
    pub prefix: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepositoryStatus {
    pub ready: bool,
}

#[async_trait]
pub trait RepositoryProvider: Send + Sync {
    async fn provision(&self, spec: &RepositorySpec) -> Result<RepositoryHandle, ProviderError>;
    async fn deprovision(&self, handle: &RepositoryHandle) -> Result<(), ProviderError>;
    async fn describe(&self, handle: &RepositoryHandle) -> Result<RepositoryStatus, ProviderError>;
    async fn update(&self, handle: &RepositoryHandle, patch: &serde_json::Value) -> Result<(), ProviderError>;
    async fn health_check(&self) -> Result<(), ProviderError>;
    async fn list_resources(&self) -> Result<Vec<RepositoryHandle>, ProviderError>;
}
