//! Integration tests for PostgreSQL StateStore.

use std::env;
use chrono::Utc;
use persistence::{PostgresStateStore, StateStore, ResourceData, OutboxEvent};
use uuid::Uuid;

#[tokio::test]
#[ignore] // Requires PostgreSQL instance
async fn test_postgres_statestore_lifecycle() {
    let database_url = env::var("TEST_DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://test:test@localhost:5432/test".to_string());

    let store = PostgresStateStore::new(&database_url)
        .await
        .expect("Failed to create StateStore");

    // Test create resource
    let resource = ResourceData {
        resource_id: "test-resource-1".to_string(),
        resource_kind: "Repository".to_string(),
        version: 1,
        spec: serde_json::json!({"name": "test-repo"}),
        state: serde_json::json!({"status": "pending"}),
        phase: "Pending".to_string(),
        finalizers: vec!["finalizer-1".to_string()],
        deletion_requested: false,
        owner_refs: serde_json::json!([]),
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };

    store.put_resource(resource.clone())
        .await
        .expect("Failed to put resource");

    // Test get resource
    let retrieved = store.get_resource("test-resource-1")
        .await
        .expect("Failed to get resource");
    
    assert!(retrieved.is_some());
    let retrieved = retrieved.unwrap();
    assert_eq!(retrieved.resource_id, "test-resource-1");
    assert_eq!(retrieved.version, 1);

    // Test version conflict
    let mut conflict_resource = resource.clone();
    conflict_resource.version = 2;
    let result = store.put_resource(conflict_resource).await;
    assert!(result.is_err());

    // Test update with correct version
    let mut updated = resource.clone();
    updated.version = 2;
    updated.state = serde_json::json!({"status": "provisioned"});
    store.put_resource(updated)
        .await
        .expect("Failed to update resource");

    // Test delete
    store.delete_resource("test-resource-1", 2)
        .await
        .expect("Failed to delete resource");

    let deleted = store.get_resource("test-resource-1")
        .await
        .expect("Failed to get deleted resource");
    assert!(deleted.is_none());
}

#[tokio::test]
#[ignore] // Requires PostgreSQL instance
async fn test_postgres_statestore_outbox() {
    let database_url = env::var("TEST_DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://test:test@localhost:5432/test".to_string());

    let store = PostgresStateStore::new(&database_url)
        .await
        .expect("Failed to create StateStore");

    // Test enqueue event
    let event = OutboxEvent {
        id: None,
        event_type: "RepositoryCreated".to_string(),
        event_data: serde_json::json!({"id": "repo-1"}),
        resource_id: "repo-1".to_string(),
        resource_kind: "Repository".to_string(),
        created_at: Utc::now(),
    };

    store.enqueue_event(event.clone())
        .await
        .expect("Failed to enqueue event");

    // Test get unpublished events
    let unpublished = store.get_unpublished_events(10)
        .await
        .expect("Failed to get unpublished events");
    
    assert!(!unpublished.is_empty());
    let event_id = unpublished[0].id.expect("Event should have ID");

    // Test mark as published
    store.mark_event_published(event_id)
        .await
        .expect("Failed to mark event as published");

    // Verify no unpublished events
    let unpublished = store.get_unpublished_events(10)
        .await
        .expect("Failed to get unpublished events");
    assert!(unpublished.is_empty());
}

#[tokio::test]
#[ignore] // Requires PostgreSQL instance
async fn test_postgres_statestore_list_resources() {
    let database_url = env::var("TEST_DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://test:test@localhost:5432/test".to_string());

    let store = PostgresStateStore::new(&database_url)
        .await
        .expect("Failed to create StateStore");

    // Create test resources
    for i in 0..3 {
        let resource = ResourceData {
            resource_id: format!("test-list-{}", i),
            resource_kind: "Repository".to_string(),
            version: 1,
            spec: serde_json::json!({"name": format!("repo-{}", i)}),
            state: serde_json::json!({"status": "pending"}),
            phase: "Pending".to_string(),
            finalizers: vec![],
            deletion_requested: false,
            owner_refs: serde_json::json!([]),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };
        store.put_resource(resource).await.expect("Failed to put resource");
    }

    // Test list by kind
    let repositories = store.list_resources(Some("Repository"), None)
        .await
        .expect("Failed to list resources");
    assert!(repositories.len() >= 3);

    // Test list by phase
    let pending = store.list_resources(None, Some("Pending"))
        .await
        .expect("Failed to list resources");
    assert!(!pending.is_empty());

    // Cleanup
    for i in 0..3 {
        store.delete_resource(&format!("test-list-{}", i), 1)
            .await
            .ok();
    }
}
