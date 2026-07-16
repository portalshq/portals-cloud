//! Contract tests for StorageProvider implementations.

use std::sync::Arc;
use control_plane_provider_trait::StorageProvider;
use control_plane_mock_provider::MockStorageProvider;
use control_plane_mock_provider::MockProviderConfig;

#[tokio::test]
async fn contract_storage_allocate_returns_allocation() {
    let provider = Arc::new(MockStorageProvider::new(MockProviderConfig::default()));

    let spec = control_plane_provider_trait::StorageAllocationSpec {
        quota_bytes: 1024 * 1024 * 1024, // 1GB
        tier: "standard".to_string(),
        region: "us-east-1".to_string(),
    };

    let allocation = provider.allocate(&spec).await.unwrap();

    // Contract: allocation must match spec
    assert_eq!(allocation.quota_bytes, spec.quota_bytes);
    assert_eq!(allocation.tier, spec.tier);
    assert_eq!(allocation.region, spec.region);
}

#[tokio::test]
async fn contract_storage_deallocate_removes_allocation() {
    let provider = Arc::new(MockStorageProvider::new(MockProviderConfig::default()));

    let spec = control_plane_provider_trait::StorageAllocationSpec {
        quota_bytes: 1024 * 1024 * 1024,
        tier: "standard".to_string(),
        region: "us-east-1".to_string(),
    };

    let allocation = provider.allocate(&spec).await.unwrap();
    provider.deallocate(&allocation).await.unwrap();

    // Contract: deallocate should succeed
}
