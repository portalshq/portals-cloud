use crate::event_types::PlatformEvent;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutboxEvent {
    pub event_type: String,
    pub partition_key: String,
    pub payload: PlatformEvent,
}

pub trait OutboxRelay: Send + Sync {
    fn enqueue(&self, event: PlatformEvent) -> Result<(), String>;
}
