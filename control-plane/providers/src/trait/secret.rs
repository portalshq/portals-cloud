use super::ProviderError;
use async_trait::async_trait;
use std::time::Duration;

pub type SecretKey = String;
pub type SecretValue = String;

#[async_trait]
pub trait SecretProvider: Send + Sync {
    async fn get(&self, key: &SecretKey) -> Result<SecretValue, ProviderError>;
    async fn set(&self, key: &SecretKey, value: SecretValue, ttl: Option<Duration>) -> Result<(), ProviderError>;
    async fn rotate(&self, key: &SecretKey) -> Result<SecretValue, ProviderError>;
    async fn revoke(&self, key: &SecretKey) -> Result<(), ProviderError>;
    async fn health_check(&self) -> Result<(), ProviderError>;
}
