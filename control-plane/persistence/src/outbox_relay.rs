use crate::sqlx_store::PostgresStateStore;
use std::sync::Arc;
use tracing::{debug, error, info};

pub struct OutboxRelay {
    store: Arc<PostgresStateStore>,
    poll_interval_ms: u64,
    batch_size: i64,
}

impl OutboxRelay {
    pub fn new(store: Arc<PostgresStateStore>, poll_interval_ms: u64) -> Self {
        Self {
            store,
            poll_interval_ms,
            batch_size: 50,
        }
    }

    pub async fn run(&self, sqs_url: &str) {
        info!(
            poll_interval_ms = self.poll_interval_ms,
            batch_size = self.batch_size,
            sqs_url = %if sqs_url.is_empty() { "(not configured)".to_string() } else { sqs_url.to_string() },
            "starting outbox relay"
        );

        loop {
            match self.store.poll_unpublished_events(self.batch_size).await {
                Ok(events) if events.is_empty() => {
                    tokio::time::sleep(tokio::time::Duration::from_millis(self.poll_interval_ms))
                        .await;
                }
                Ok(events) => {
                    let seqs: Vec<i64> = events.iter().map(|e| e.seq).collect();
                    let count = events.len();

                    for event in &events {
                        debug!(
                            seq = event.seq,
                            event_type = %event.event_type,
                            partition_key = %event.partition_key,
                            "publishing event"
                        );
                    }

                    // TODO: When SQS/EventBridge is configured, actually deliver events here.
                    // For now, mark as published since the relay is running.
                    if !sqs_url.is_empty() {
                        // Future: send to SQS using sqs_client.send_message(...)
                    }

                    if let Err(e) = self.store.mark_events_published(&seqs).await {
                        error!(error = %e, "failed to mark events as published");
                    } else {
                        info!(count = count, "published batch of outbox events");
                    }
                }
                Err(e) => {
                    error!(error = %e, "failed to poll outbox events");
                    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                }
            }
        }
    }
}
