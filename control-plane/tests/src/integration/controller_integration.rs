//! Integration tests for controller with mock provider.

use std::sync::Arc;
use reconciler::ControllerMetrics;
use control_plane_mock_provider::{MockRepositoryProvider, MockProviderConfig, create_mock_provider};
use control_plane_provider_trait::RepositoryProvider;

#[tokio::test]
async fn test_repository_provisioning() {
    let config = MockProviderConfig::default();
    let provider = Arc::new(MockRepositoryProvider::new(config));

    let spec = control_plane_provider_trait::RepositorySpec {
        name: "test-repo".to_string(),
        storage_class: "standard".to_string(),
        region: "us-east-1".to_string(),
        tags: vec![],
    };

    let handle = provider.provision(&spec).await.unwrap();

    assert!(!handle.bucket_name.is_empty());
    assert_eq!(handle.region, "us-east-1");

    // Cleanup
    provider.deprovision(&handle).await.unwrap();
}

#[tokio::test]
async fn test_repository_list() {
    let config = MockProviderConfig::default();
    let provider = Arc::new(MockRepositoryProvider::new(config));

    let spec = control_plane_provider_trait::RepositorySpec {
        name: "test-repo".to_string(),
        storage_class: "standard".to_string(),
        region: "us-east-1".to_string(),
        tags: vec![],
    };

    let handle = provider.provision(&spec).await.unwrap();

    let resources = provider.list_resources().await.unwrap();
    assert!(!resources.is_empty());

    // Cleanup
    provider.deprovision(&handle).await.unwrap();
}
