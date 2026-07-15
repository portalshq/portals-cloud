//! Custom metrics definitions for the Lore Cloud Control Plane.
//!
//! HTTP request metrics (count, duration, in-flight) are automatically collected
//! by `axum_prometheus::PrometheusMetricLayer`. This module defines additional
//! application-level metrics for reconciler and outbox operations.

use metrics::{counter, describe_counter, describe_gauge, gauge};

/// Initialize all custom metric descriptors.
///
/// Call once at startup before any metrics are recorded.
pub fn init_metrics() {
    describe_counter!(
        "lorecloud_reconciler_runs_total",
        "Total number of reconciler runs per resource kind"
    );
    describe_counter!(
        "lorecloud_reconciler_failures_total",
        "Total number of reconciler failures per resource kind and error type"
    );
    describe_counter!(
        "lorecloud_outbox_events_published_total",
        "Total number of outbox events published"
    );
    describe_gauge!(
        "lorecloud_outbox_events_pending",
        "Number of outbox events pending publication"
    );
}

/// Record a successful reconciler run.
pub fn record_reconcile_success(kind: &str) {
    counter!("lorecloud_reconciler_runs_total", "kind" => kind.to_string()).increment(1);
}

/// Record a reconciler failure.
pub fn record_reconcile_failure(kind: &str, error_type: &str) {
    counter!(
        "lorecloud_reconciler_failures_total",
        "kind" => kind.to_string(),
        "error" => error_type.to_string()
    )
    .increment(1);
}

/// Record outbox events published in a batch.
pub fn record_outbox_published(count: u64) {
    counter!("lorecloud_outbox_events_published_total").increment(count);
}

/// Set the gauge of pending outbox events.
pub fn set_outbox_pending(count: u64) {
    gauge!("lorecloud_outbox_events_pending").set(count as f64);
}
