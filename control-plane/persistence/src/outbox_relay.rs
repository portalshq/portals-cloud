use crate::sqlx_store::PostgresStateStore;
use std::sync::Arc;
use tracing::{debug, error, info, warn};
use aws_sdk_sqs::Client as SqsClient;

pub struct OutboxRelay {
    store: Arc<PostgresStateStore>,
    poll_interval_ms: u64,
    batch_size: i64,
    sqs_client: Option<SqsClient>,
    queue_url: String,
}

impl OutboxRelay {
    pub fn new(store: Arc<PostgresStateStore>, poll_interval_ms: u64) -> Self {
        Self {
            store,
            poll_interval_ms,
            batch_size: 50,
            sqs_client: None,
            queue_url: String::new(),
        }
    }

    pub fn with_sqs(mut self, queue_url: String, sqs_client: SqsClient) -> Self {
        self.queue_url = queue_url;
        self.sqs_client = Some(sqs_client);
        self
    }

    pub async fn run(&self) {
        info!(
            poll_interval_ms = self.poll_interval_ms,
            batch_size = self.batch_size,
            sqs_configured = self.sqs_client.is_some(),
            queue_url = %if self.queue_url.is_empty() { "(not configured)".to_string() } else { self.queue_url.clone() },
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

                    // Deliver events to SQS if configured
                    let delivery_result = if let Some(sqs_client) = &self.sqs_client {
                        if !self.queue_url.is_empty() {
                            self.deliver_events_to_sqs(sqs_client, &events).await
                        } else {
                            warn!("SQS client configured but queue URL is empty, skipping delivery");
                            Ok(())
                        }
                    } else {
                        debug!("SQS not configured, marking events as published without delivery");
                        Ok(())
                    };

                    match delivery_result {
                        Ok(_) => {
                            if let Err(e) = self.store.mark_events_published(&seqs).await {
                                error!(error = %e, "failed to mark events as published");
                            } else {
                                info!(count = count, "published batch of outbox events");
                            }
                        }
                        Err(e) => {
                            error!(error = %e, "failed to deliver events to SQS, will retry on next poll");
                            tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                        }
                    }
                }
                Err(e) => {
                    error!(error = %e, "failed to poll outbox events");
                    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                }
            }
        }
    }

    async fn deliver_events_to_sqs(
        &self,
        sqs_client: &SqsClient,
        events: &[crate::sqlx_store::OutboxRow],
    ) -> Result<(), String> {
        for event in events {
            let message_body = serde_json::to_string(&event.payload)
                .map_err(|e| format!("failed to serialize event payload: {e}"))?;

            let event_attr = aws_sdk_sqs::types::MessageAttributeValue::builder()
                .string_value(event.event_type.clone())
                .data_type("String")
                .build()
                .map_err(|e| format!("failed to build event_type attribute: {e}"))?;

            let partition_attr = aws_sdk_sqs::types::MessageAttributeValue::builder()
                .string_value(event.partition_key.clone())
                .data_type("String")
                .build()
                .map_err(|e| format!("failed to build partition_key attribute: {e}"))?;

            let send_result = sqs_client
                .send_message()
                .queue_url(&self.queue_url)
                .message_body(&message_body)
                .message_attributes("event_type", event_attr)
                .message_attributes("partition_key", partition_attr)
                .send()
                .await
                .map_err(|e| format!("SQS send_message failed: {e}"))?;

            debug!(
                message_id = send_result.message_id().unwrap_or("unknown"),
                seq = event.seq,
                "delivered event to SQS"
            );
        }
        Ok(())
    }
}
