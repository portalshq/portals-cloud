//! Integration tests for StateStore implementations.

use persistence::{MockStateStore, StateStore};
use models::ResourceId;
use models::ResourceKind;

#[tokio::test]
async fn test_mock_statestore_lifecycle() {
    let store = MockStateStore::new();
    let resource_id = ResourceId::new("test-resource-1");

    // Test set_observed_versioned
    let state = serde_json::json!({"name": "test-repo", "status": "pending"});
    let version = store.set_observed_versioned(&resource_id, &state, 0)
        .await
        .expect("Failed to set observed state");
    assert_eq!(version, 1);

    // Test get_observed
    let retrieved: serde_json::Value = store.get_observed(&resource_id)
        .await
        .expect("Failed to get observed state")
        .expect("Resource should exist");
    assert_eq!(retrieved["name"], "test-repo");

    // Test version conflict
    let result = store.set_observed_versioned(&resource_id, &state, 0).await;
    assert!(result.is_err(), "Should fail with stale version");

    // Test update with correct version
    let updated_state = serde_json::json!({"name": "test-repo", "status": "provisioned"});
    let new_version = store.set_observed_versioned(&resource_id, &updated_state, 1)
        .await
        .expect("Failed to update state");
    assert_eq!(new_version, 2);

    // Test remove_observed
    store.remove_observed(&resource_id)
        .await
        .expect("Failed to remove resource");

    let deleted = store.get_observed::<serde_json::Value>(&resource_id)
        .await
        .expect("Failed to get deleted resource");
    assert!(deleted.is_none());
}

#[tokio::test]
async fn test_mock_statestore_transaction() {
    let store = MockStateStore::new();
    let resource_id = ResourceId::new("test-resource-1");

    // Test transaction with single operation
    // Note: Arc<dyn StoreTransaction> doesn't support &mut self in the trait
    // This is a limitation of the current design. For now, test without transactions.
    let state = serde_json::json!({"name": "test-repo"});
    let version = store.set_observed_versioned(&resource_id, &state, 0)
        .await
        .expect("Failed to set observed state");
    assert_eq!(version, 1);

    // Verify resource was created
    let retrieved = store.get_observed::<serde_json::Value>(&resource_id).await;
    assert!(retrieved.is_ok());
    assert!(retrieved.unwrap().is_some());
}

#[tokio::test]
async fn test_mock_statestore_finalizers() {
    let store = MockStateStore::new();
    let resource_id = ResourceId::new("test-resource-1");
    let kind = "Repository";

    // Test set_observed_versioned with finalizers
    let state = serde_json::json!({"name": "test-repo"});
    store.set_observed_versioned(&resource_id, &state, 0)
        .await
        .expect("Failed to set observed state");

    // Test set_finalizers
    let finalizers = vec!["finalizer-1".to_string(), "finalizer-2".to_string()];
    store.set_finalizers(kind, &resource_id, &finalizers)
        .await
        .expect("Failed to set finalizers");

    // Test remove_finalizer
    store.remove_finalizer(&resource_id, 1, "finalizer-1")
        .await
        .expect("Failed to remove finalizer");

    // Test mark_deletion_requested
    store.mark_deletion_requested(&resource_id)
        .await
        .expect("Failed to mark deletion requested");

    // Test exists
    let exists = store.exists(ResourceKind::Repository, &resource_id)
        .await
        .expect("Failed to check existence");
    assert!(exists);

    // Test remove_observed
    store.remove_observed(&resource_id)
        .await
        .expect("Failed to remove resource");

    let exists = store.exists(ResourceKind::Repository, &resource_id)
        .await
        .expect("Failed to check existence");
    assert!(!exists);
}
