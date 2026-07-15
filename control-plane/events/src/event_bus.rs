use crate::event_types::PlatformEvent;
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use futures::Stream;
use std::pin::Pin;
use std::time::Duration;
use thiserror::Error;

pub type Timestamp = DateTime<Utc>;

#[derive(Debug, Error)]
pub enum EventError {
    #[error("Failed to publish event: {0}")]
    Publish(String),
    #[error("Failed to subscribe: {0}")]
    Subscribe(String),
}

#[derive(Debug, Clone)]
pub struct EventFilter {
    pub resource_kind: Option<String>,
    pub event_types: Option<Vec<String>>,
    pub source_ids: Option<Vec<String>>,
    pub partition_key: Option<String>,
}

pub struct DeadLetter {
    pub event: PlatformEvent,
    pub failure_count: u32,
    pub last_error: String,
    pub first_failed: Timestamp,
    pub last_failed: Timestamp,
}

#[async_trait]
pub trait EventBus: Send + Sync {
    async fn publish(&self, event: PlatformEvent) -> Result<String, EventError>;

    async fn subscribe(
        &self,
        filter: EventFilter,
        ack_timeout: Duration,
    ) -> Result<Pin<Box<dyn Stream<Item = (String, PlatformEvent)> + Send>>, EventError>;

    async fn acknowledge(&self, id: String) -> Result<(), EventError>;

    async fn replay_from(
        &self,
        since: Timestamp,
        filter: EventFilter,
    ) -> Result<Pin<Box<dyn Stream<Item = (String, PlatformEvent)> + Send>>, EventError>;

    async fn dead_letters(
        &self,
        filter: EventFilter,
    ) -> Result<Pin<Box<dyn Stream<Item = DeadLetter> + Send>>, EventError>;
}
