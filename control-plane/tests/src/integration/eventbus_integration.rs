//! Integration tests for SQS EventBus.

use std::env;
use aws_config::Region;
use events::{SqsEventBus, EventBus, PlatformEvent};
use reconciler::ResourceId;

#[tokio::test]
#[ignore] // Requires AWS credentials and SQS queue
async fn test_sqs_eventbus_publish() {
    let queue_url = env::var("TEST_SQS_QUEUE_URL")
        .unwrap_or_else(|_| "http://localhost:9324/queue/events".to_string());
    let dlq_url = env::var("TEST_SQS_DLQ_URL")
        .unwrap_or_else(|_| "http://localhost:9324/queue/events-dlq".to_string());
    let region = env::var("TEST_AWS_REGION")
        .unwrap_or_else(|_| "us-east-1".to_string());

    let event_bus = SqsEventBus::new(
        queue_url,
        dlq_url,
        Region::from_static(&region),
    )
    .await
    .expect("Failed to create EventBus");

    // Test publish
    let event = PlatformEvent::RepositoryCreated {
        id: ResourceId::new("test-repo-1"),
    };

    let message_id = event_bus.publish(event)
        .await
        .expect("Failed to publish event");

    assert!(!message_id.is_empty());
}

#[tokio::test]
#[ignore] // Requires AWS credentials and SQS queue
async fn test_sqs_eventbus_health_check() {
    let queue_url = env::var("TEST_SQS_QUEUE_URL")
        .unwrap_or_else(|_| "http://localhost:9324/queue/events".to_string());
    let dlq_url = env::var("TEST_SQS_DLQ_URL")
        .unwrap_or_else(|_| "http://localhost:9324/queue/events-dlq".to_string());
    let region = env::var("TEST_AWS_REGION")
        .unwrap_or_else(|_| "us-east-1".to_string());

    let event_bus = SqsEventBus::new(
        queue_url,
        dlq_url,
        Region::from_static(&region),
    )
    .await
    .expect("Failed to create EventBus");

    event_bus.health_check()
        .await
        .expect("Health check failed");
}

#[tokio::test]
#[ignore] // Requires AWS credentials and SQS queue
async fn test_sqs_eventbus_dead_letters() {
    let queue_url = env::var("TEST_SQS_QUEUE_URL")
        .unwrap_or_else(|_| "http://localhost:9324/queue/events".to_string());
    let dlq_url = env::var("TEST_SQS_DLQ_URL")
        .unwrap_or_else(|_| "http://localhost:9324/queue/events-dlq".to_string());
    let region = env::var("TEST_AWS_REGION")
        .unwrap_or_else(|_| "us-east-1".to_string());

    let event_bus = SqsEventBus::new(
        queue_url,
        dlq_url,
        Region::from_static(&region),
    )
    .await
    .expect("Failed to create EventBus");

    // Test dead letters retrieval
    let dead_letters = event_bus.dead_letters(10)
        .await
        .expect("Failed to get dead letters");

    // Should return empty list if no dead letters
    assert!(dead_letters.is_empty());
}
