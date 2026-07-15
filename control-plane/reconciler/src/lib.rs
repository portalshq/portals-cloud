use models::{Controller, ErrorPolicy, ReconcileContext, ReconcileResult, Resource, ResourceKind};
use persistence::PostgresStateStore;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{Mutex, Notify};
use tokio::time::Interval;
use tracing::{debug, error, info, warn};

/// Typed reconciler loop — edge-triggered (Notify) + level-triggered (interval).
///
/// For each resource of kind `C::Resource`, calls `controller.reconcile()` and
/// applies the error policy on failure. The `builder` function converts raw DB
/// rows into typed resources.
pub struct TypedReconcilerLoop<C: Controller> {
    store: Arc<PostgresStateStore>,
    controller: Arc<C>,
    sweep_interval: Mutex<Interval>,
    pending: Arc<Notify>,
    kind: ResourceKind,
}

impl<C: Controller + 'static> TypedReconcilerLoop<C>
where
    C::Resource: Send + Sync + 'static,
{
    pub fn new(
        store: Arc<PostgresStateStore>,
        controller: Arc<C>,
        kind: ResourceKind,
        sweep_interval_ms: u64,
    ) -> Self {
        let sweep_interval = tokio::time::interval(Duration::from_millis(sweep_interval_ms));
        Self {
            store,
            controller,
            sweep_interval: Mutex::new(sweep_interval),
            pending: Arc::new(Notify::new()),
            kind,
        }
    }

    pub fn notify(&self) {
        self.pending.notify_one();
    }

    pub async fn run_with_builder<F>(&self, builder: F)
    where
        F: Fn(&persistence::ResourceRow) -> Option<Arc<C::Resource>> + Send + Sync + 'static,
    {
        let kind_str = self.kind.as_str();
        info!(kind = %kind_str, "starting typed reconciler loop");

        loop {
            tokio::select! {
                _ = self.pending.notified() => {
                    debug!(kind = %kind_str, "edge-triggered reconcile");
                }
                _ = async {
                    let mut interval = self.sweep_interval.lock().await;
                    interval.tick().await
                } => {
                    debug!(kind = %kind_str, "level-triggered sweep");
                }
            }

            match self.store.list_resources(kind_str).await {
                Ok(resources) => {
                    for row in resources {
                        let resource = match builder(&row) {
                            Some(r) => r,
                            None => {
                                warn!(id = %row.id, "skipping resource: failed to build");
                                continue;
                            }
                        };

                        let ctx = ReconcileContext::new();
                        match self.controller.reconcile(resource.clone(), ctx.clone()).await {
                            Ok(ReconcileResult::Ok) => {
                                debug!(id = %resource.id().as_str(), "reconcile ok");
                            }
                            Ok(ReconcileResult::RequeueAfter(dur)) => {
                                info!(id = %resource.id().as_str(), delay_ms = dur.as_millis() as u64, "requeue");
                                let pending = self.pending.clone();
                                tokio::spawn(async move {
                                    tokio::time::sleep(dur).await;
                                    pending.notify_one();
                                });
                            }
                            Err(e) => {
                                let policy = self.controller.error_policy(resource.clone(), &e, ctx.clone());
                                match policy {
                                    ErrorPolicy::Backoff { initial, multiplier, max, jitter } => {
                                        let delay = compute_backoff(ctx.attempt, initial, multiplier, max, jitter);
                                        warn!(id = %resource.id().as_str(), error = %e, attempt = ctx.attempt, delay_ms = delay.as_millis() as u64, "reconcile error, backing off");
                                        let pending = self.pending.clone();
                                        tokio::spawn(async move {
                                            tokio::time::sleep(delay).await;
                                            pending.notify_one();
                                        });
                                    }
                                    ErrorPolicy::ExtendedBackoff { max } => {
                                        warn!(id = %resource.id().as_str(), error = %e, "extended backoff");
                                        let pending = self.pending.clone();
                                        tokio::spawn(async move {
                                            tokio::time::sleep(max).await;
                                            pending.notify_one();
                                        });
                                    }
                                    ErrorPolicy::Discard => {
                                        error!(id = %resource.id().as_str(), error = %e, "discarding");
                                    }
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    error!(kind = %kind_str, error = %e, "failed to list resources");
                    tokio::time::sleep(Duration::from_secs(5)).await;
                }
            }
        }
    }
}

pub fn compute_backoff(attempt: u32, initial: Duration, multiplier: f64, max: Duration, jitter: f64) -> Duration {
    let base_ms = initial.as_millis() as f64 * multiplier.powi(attempt as i32 - 1);
    let jitter_range = base_ms * jitter;
    let jitter_offset = (rand::random::<f64>() * 2.0 - 1.0) * jitter_range;
    let delay_ms = (base_ms + jitter_offset).max(0.0);
    Duration::from_millis((delay_ms as u64).min(max.as_millis() as u64))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compute_backoff_basic() {
        let delay = compute_backoff(1, Duration::from_secs(1), 2.0, Duration::from_secs(60), 0.0);
        assert_eq!(delay, Duration::from_secs(1));
    }

    #[test]
    fn compute_backoff_exponential() {
        let delay = compute_backoff(2, Duration::from_secs(1), 2.0, Duration::from_secs(60), 0.0);
        assert_eq!(delay, Duration::from_secs(2));
    }

    #[test]
    fn compute_backoff_capped() {
        let delay = compute_backoff(100, Duration::from_secs(1), 2.0, Duration::from_secs(60), 0.0);
        assert_eq!(delay, Duration::from_secs(60));
    }
}
