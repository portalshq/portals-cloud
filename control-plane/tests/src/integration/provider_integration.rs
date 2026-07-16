//! Integration tests for provider implementations.

use control_plane_mock_provider::{create_mock_provider, MockProviderConfig};
use control_plane_provider_trait::InfrastructureProvider;

#[tokio::test]
async fn test_infrastructure_provider_health() {
    let config = MockProviderConfig::default();
    let provider = create_mock_provider(config);

    provider.repository.health_check().await.unwrap();
    provider.storage.health_check().await.unwrap();
    provider.compute.health_check().await.unwrap();
    provider.identity.health_check().await.unwrap();
    provider.networking.health_check().await.unwrap();
    provider.secrets.health_check().await.unwrap();
}
