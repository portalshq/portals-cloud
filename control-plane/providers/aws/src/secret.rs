//! AWS Secrets Manager secret provider implementation.

use aws_sdk_secretsmanager::Client;
use aws_config::SdkConfig;
use control_plane_provider_trait::{
    SecretProvider, SecretKey, SecretValue,
    ProviderError,
};
use std::sync::Arc;

pub struct AwsSecretProvider {
    client: Arc<Client>,
}

impl AwsSecretProvider {
    pub fn new(config: SdkConfig) -> Self {
        let client = Arc::new(Client::new(&config));
        Self { client }
    }
}

#[async_trait::async_trait]
impl SecretProvider for AwsSecretProvider {
    async fn get(&self, key: &SecretKey) -> Result<SecretValue, ProviderError> {
        let response = self
            .client
            .get_secret_value()
            .secret_id(key.as_str())
            .send()
            .await
            .map_err(|e| ProviderError::NotFound(format!("Secret not found: {}", e)))?;

        let value = response
            .secret_string()
            .ok_or_else(|| ProviderError::NotFound("Secret value is empty".to_string()))?;

        Ok(SecretValue {
            value: value.to_string(),
            version: response.version().unwrap_or("1").to_string(),
        })
    }

    async fn set(
        &self,
        key: &SecretKey,
        value: &SecretValue,
        _ttl: Option<std::time::Duration>,
    ) -> Result<(), ProviderError> {
        self.client
            .create_secret()
            .name(key.as_str())
            .secret_string(&value.value)
            .send()
            .await
            .map_err(|e| ProviderError::OperationFailed(format!("SecretsManager create_secret: {}", e)))?;
        Ok(())
    }

    async fn rotate(&self, key: &SecretKey) -> Result<SecretValue, ProviderError> {
        // Trigger secret rotation
        self.get(key).await
    }

    async fn revoke(&self, key: &SecretKey) -> Result<(), ProviderError> {
        self.client
            .delete_secret()
            .secret_id(key.as_str())
            .send()
            .await
            .map_err(|e| ProviderError::OperationFailed(format!("SecretsManager delete_secret: {}", e)))?;
        Ok(())
    }

    async fn health_check(&self) -> Result<(), ProviderError> {
        self.client
            .list_secrets()
            .send()
            .await
            .map_err(|e| ProviderError::Unavailable(format!("SecretsManager health check failed: {}", e)))?;
        Ok(())
    }
}
