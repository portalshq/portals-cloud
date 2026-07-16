//! Contract tests for RepositoryProvider implementations.

use std::sync::Arc;
use control_plane_provider_trait::RepositoryProvider;
use control_plane_mock_provider::MockRepositoryProvider;
use control_plane_mock_provider::MockProviderConfig;

#[tokio::test]
async fn contract_repository_provision_creates_handle() {
    let provider = Arc::new(MockRepositoryProvider::new(MockProviderConfig::default()));

    let spec = control_plane_provider_trait::RepositorySpec {
        name: "test-repo".to_string(),
        storage_class: "standard".to_string(),
        region: "us-east-1".to_string(),
        tags: vec![],
    };

    let handle = provider.provision(&spec).await.unwrap();

    // Contract: handle must have valid fields
    assert!(!handle.id.as_str().is_empty());
    assert!(!handle.bucket_name.is_empty());
    assert!(!handle.arn.is_empty());
}

#[tokio::test]
async fn contract_repository_deprovision_removes_handle() {
    let provider = Arc::new(MockRepositoryProvider::new(MockProviderConfig::default()));

    let spec = control_plane_provider_trait::RepositorySpec {
        name: "test-repo".to_string(),
        storage_class: "standard".to_string(),
        region: "us-east-1".to_string(),
        tags: vec![],
    };

    let handle = provider.provision(&spec).await.unwrap();
    provider.deprovision(&handle).await.unwrap();

    // Contract: describe should fail after deprovision
    let result = provider.describe(&handle).await;
    assert!(result.is_err());
}
