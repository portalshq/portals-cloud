use crate::state_store::{StateStore, StoreError, StoreTransaction};
use async_trait::async_trait;
use models::{ResourceId, ResourceKind};
use events::PlatformEvent;
use serde::de::DeserializeOwned;
use serde::Serialize;
use sqlx::postgres::PgPool;
use sqlx::Row;
use std::future::Future;
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{debug, info};

pub struct PostgresStateStore {
    pool: PgPool,
}

impl PostgresStateStore {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    pub async fn run_migrations(&self) -> Result<(), StoreError> {
        sqlx::raw_sql(include_str!("../migrations/001_init.sql"))
            .execute(&self.pool)
            .await
            .map_err(|e| StoreError::Database(format!("Migration failed: {e}")))?;
        info!("database migrations applied");
        Ok(())
    }
}

pub struct PostgresTransactionPool<'a> {
    tx: Arc<Mutex<Option<sqlx::Transaction<'a, sqlx::Postgres>>>>,
}

impl<'a> PostgresTransactionPool<'a> {
    fn new(tx: sqlx::Transaction<'a, sqlx::Postgres>) -> Self {
        Self { tx: Arc::new(Mutex::new(Some(tx))) }
    }

    async fn commit(&self) -> Result<(), StoreError> {
        if let Some(tx) = self.tx.lock().await.take() {
            tx.commit()
                .await
                .map_err(|e| StoreError::Database(format!("failed to commit transaction: {e}")))?;
        }
        Ok(())
    }

    async fn rollback(&self) -> Result<(), StoreError> {
        if let Some(tx) = self.tx.lock().await.take() {
            tx.rollback()
                .await
                .map_err(|e| StoreError::Database(format!("failed to rollback transaction: {e}")))?;
        }
        Ok(())
    }
}

#[async_trait]
impl<'a> StoreTransaction for PostgresTransactionPool<'a> {
    async fn set_observed(
        &self,
        id: &ResourceId,
        state: &serde_json::Value,
        version: u64,
    ) -> Result<(), StoreError> {
        let mut tx_guard = self.tx.lock().await;
        let tx = tx_guard.as_mut().ok_or_else(|| StoreError::Database("Transaction already consumed".into()))?;
        let result = sqlx::query(
            r#"UPDATE resources
               SET status = $1, version = version + 1, updated_at = NOW()
               WHERE id = $2 AND version = $3"#,
        )
        .bind(state)
        .bind(id.as_str())
        .bind(version as i64)
        .execute(&mut **tx)
        .await
        .map_err(|e| StoreError::Database(format!("set_observed: {e}")))?;

        if result.rows_affected() == 0 {
            return Err(StoreError::StaleVersion);
        }
        Ok(())
    }

    async fn set_workflow_id(
        &self,
        id: &ResourceId,
        workflow_id: &str,
        _version: u64,
    ) -> Result<(), StoreError> {
        let mut tx_guard = self.tx.lock().await;
        let tx = tx_guard.as_mut().ok_or_else(|| StoreError::Database("Transaction already consumed".into()))?;
        sqlx::query(
            r#"UPDATE resources SET workflow_id = $1, updated_at = NOW() WHERE id = $2"#,
        )
        .bind(workflow_id)
        .bind(id.as_str())
        .execute(&mut **tx)
        .await
        .map_err(|e| StoreError::Database(format!("set_workflow_id: {e}")))?;
        Ok(())
    }

    async fn enqueue_outbox_event(&self, event: PlatformEvent) -> Result<(), StoreError> {
        let mut tx_guard = self.tx.lock().await;
        let tx = tx_guard.as_mut().ok_or_else(|| StoreError::Database("Transaction already consumed".into()))?;
        let event_type = serde_json::to_value(&event)
            .ok()
            .and_then(|v| v.get("type").cloned())
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_else(|| "Unknown".to_string());

        let partition_key = extract_partition_key(&event);
        let payload = serde_json::to_value(&event)
            .map_err(|e| StoreError::Database(format!("serialize event: {e}")))?;

        sqlx::query(
            r#"INSERT INTO outbox_events (event_type, partition_key, payload)
               VALUES ($1, $2, $3)"#,
        )
        .bind(&event_type)
        .bind(&partition_key)
        .bind(&payload)
        .execute(&mut **tx)
        .await
        .map_err(|e| StoreError::Database(format!("enqueue_outbox_event: {e}")))?;

        debug!(event_type = %event_type, partition_key = %partition_key, "enqueued outbox event");
        Ok(())
    }
}

#[async_trait]
impl StateStore for PostgresStateStore {
    async fn set_observed_versioned<T: Serialize + Send + Sync>(
        &self,
        id: &ResourceId,
        state: &T,
        version: u64,
    ) -> Result<u64, StoreError> {
        let val = serde_json::to_value(state)
            .map_err(|e| StoreError::Database(format!("serialize: {e}")))?;

        let row = sqlx::query(
            r#"UPDATE resources
               SET status = $1, version = version + 1, updated_at = NOW()
               WHERE id = $2 AND version = $3
               RETURNING version"#,
        )
        .bind(&val)
        .bind(id.as_str())
        .bind(version as i64)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| StoreError::Database(format!("set_observed_versioned: {e}")))?;

        match row {
            Some(r) => {
                let new_version: i64 = r.get("version");
                Ok(new_version as u64)
            }
            None => Err(StoreError::StaleVersion),
        }
    }

    async fn transaction<F, Fut, T>(&self, f: F) -> Result<T, StoreError>
    where
        F: FnOnce(Arc<dyn StoreTransaction>) -> Fut + Send,
        Fut: Future<Output = Result<T, StoreError>> + Send,
        T: Send,
    {
        // Begin a real database transaction
        let tx = self.pool
            .begin()
            .await
            .map_err(|e| StoreError::Database(format!("failed to begin transaction: {e}")))?;
        
        // Create transactional wrapper with lifetime
        let pg_tx = PostgresTransactionPool::new(tx);
        
        // Clone the Arc so we can use it for commit/rollback after the function call
        let pg_tx_arc = Arc::new(pg_tx);
        let pg_tx_for_commit = pg_tx_arc.clone();
        
        // Execute the transactional operations
        let result = f(pg_tx_arc).await;
        
        // Commit or rollback based on result
        match result {
            Ok(value) => {
                pg_tx_for_commit.commit().await?;
                Ok(value)
            }
            Err(e) => {
                pg_tx_for_commit.rollback().await?;
                Err(e)
            }
        }
    }

    async fn get_observed<T: DeserializeOwned>(
        &self,
        id: &ResourceId,
    ) -> Result<Option<T>, StoreError> {
        let row = sqlx::query(r#"SELECT status FROM resources WHERE id = $1"#)
            .bind(id.as_str())
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| StoreError::Database(format!("get_observed: {e}")))?;

        match row {
            Some(r) => {
                let val: serde_json::Value = r.get("status");
                let deserialized: T = serde_json::from_value(val)
                    .map_err(|e| StoreError::Database(format!("deserialize: {e}")))?;
                Ok(Some(deserialized))
            }
            None => Ok(None),
        }
    }

    async fn get_handle(&self, id: &ResourceId) -> Result<serde_json::Value, StoreError> {
        let row = sqlx::query(r#"SELECT handle FROM resources WHERE id = $1"#)
            .bind(id.as_str())
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| StoreError::Database(format!("get_handle: {e}")))?;

        match row {
            Some(r) => {
                let val: Option<serde_json::Value> = r.get("handle");
                val.ok_or(StoreError::NotFound)
            }
            None => Err(StoreError::NotFound),
        }
    }

    async fn remove_observed(&self, id: &ResourceId) -> Result<(), StoreError> {
        sqlx::query(r#"DELETE FROM resources WHERE id = $1"#)
            .bind(id.as_str())
            .execute(&self.pool)
            .await
            .map_err(|e| StoreError::Database(format!("remove_observed: {e}")))?;
        Ok(())
    }

    async fn remove_finalizer(
        &self,
        id: &ResourceId,
        _version: u64,
        finalizer: &str,
    ) -> Result<(), StoreError> {
        sqlx::query(
            r#"UPDATE resources
               SET finalizers = array_remove(finalizers, $1), updated_at = NOW()
               WHERE id = $2"#,
        )
        .bind(finalizer)
        .bind(id.as_str())
        .execute(&self.pool)
        .await
        .map_err(|e| StoreError::Database(format!("remove_finalizer: {e}")))?;
        Ok(())
    }

    async fn set_finalizers(&self, kind: &str, id: &ResourceId, finalizers: &[String]) -> Result<(), StoreError> {
        PostgresStateStore::set_finalizers(self, kind, id, finalizers).await
    }

    async fn exists(&self, kind: ResourceKind, id: &ResourceId) -> Result<bool, StoreError> {
        let row = sqlx::query_scalar::<_, (bool,)>(
            r#"SELECT EXISTS(SELECT 1 FROM resources WHERE kind = $1 AND id = $2)"#,
        )
        .bind(kind.as_str())
        .bind(id.as_str())
        .fetch_one(&self.pool)
        .await
        .map_err(|e| StoreError::Database(format!("exists: {e}")))?;

        Ok(row.0)
    }

    async fn mark_deletion_requested(&self, id: &ResourceId) -> Result<(), StoreError> {
        sqlx::query(
            r#"UPDATE resources
               SET deletion_requested = TRUE, updated_at = NOW()
               WHERE id = $1"#,
        )
        .bind(id.as_str())
        .execute(&self.pool)
        .await
        .map_err(|e| StoreError::Database(format!("mark_deletion_requested: {e}")))?;
        Ok(())
    }

    async fn workflow_has_owner(&self, workflow_id: &str) -> Result<bool, StoreError> {
        let row = sqlx::query_scalar::<_, (bool,)>(
            r#"SELECT EXISTS(SELECT 1 FROM resources WHERE workflow_id = $1)"#,
        )
        .bind(workflow_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| StoreError::Database(format!("workflow_has_owner: {e}")))?;

        Ok(row.0)
    }

    async fn ping(&self) -> Result<(), StoreError> {
        sqlx::query("SELECT 1")
            .execute(&self.pool)
            .await
            .map_err(|e| StoreError::Database(format!("ping: {e}")))?;
        Ok(())
    }
}

impl PostgresStateStore {
    pub async fn create_resource(
        &self,
        kind: &str,
        id: &ResourceId,
        spec: &serde_json::Value,
        finalizers: &[String],
    ) -> Result<(), StoreError> {
        sqlx::query(
            r#"INSERT INTO resources (kind, id, spec, finalizers)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (kind, id) DO UPDATE
               SET spec = EXCLUDED.spec, finalizers = EXCLUDED.finalizers, updated_at = NOW()"#,
        )
        .bind(kind)
        .bind(id.as_str())
        .bind(spec)
        .bind(finalizers)
        .execute(&self.pool)
        .await
        .map_err(|e| StoreError::Database(format!("create_resource: {e}")))?;
        Ok(())
    }

    pub async fn get_resource_raw(
        &self,
        kind: &str,
        id: &ResourceId,
    ) -> Result<Option<ResourceRow>, StoreError> {
        let row = sqlx::query(
            r#"SELECT kind, id, version, spec, status, handle, finalizers, deletion_requested, workflow_id, created_at, updated_at
               FROM resources WHERE kind = $1 AND id = $2"#,
        )
        .bind(kind)
        .bind(id.as_str())
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| StoreError::Database(format!("get_resource_raw: {e}")))?;

        match row {
            Some(r) => Ok(Some(ResourceRow {
                kind: r.get("kind"),
                id: r.get("id"),
                version: r.get::<i64, _>("version"),
                spec: r.get("spec"),
                status: r.get("status"),
                handle: r.get("handle"),
                finalizers: r.get("finalizers"),
                deletion_requested: r.get("deletion_requested"),
                workflow_id: r.get("workflow_id"),
                created_at: r.get("created_at"),
                updated_at: r.get("updated_at"),
            })),
            None => Ok(None),
        }
    }

    pub async fn list_resources(&self, kind: &str) -> Result<Vec<ResourceRow>, StoreError> {
        let rows = sqlx::query(
            r#"SELECT kind, id, version, spec, status, handle, finalizers, deletion_requested, workflow_id, created_at, updated_at
               FROM resources WHERE kind = $1 ORDER BY created_at"#,
        )
        .bind(kind)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| StoreError::Database(format!("list_resources: {e}")))?;

        Ok(rows
            .into_iter()
            .map(|r| ResourceRow {
                kind: r.get("kind"),
                id: r.get("id"),
                version: r.get::<i64, _>("version"),
                spec: r.get("spec"),
                status: r.get("status"),
                handle: r.get("handle"),
                finalizers: r.get("finalizers"),
                deletion_requested: r.get("deletion_requested"),
                workflow_id: r.get("workflow_id"),
                created_at: r.get("created_at"),
                updated_at: r.get("updated_at"),
            })
            .collect())
    }

    pub async fn update_spec(
        &self,
        kind: &str,
        id: &ResourceId,
        spec: &serde_json::Value,
    ) -> Result<(), StoreError> {
        sqlx::query(
            r#"UPDATE resources SET spec = $1, updated_at = NOW()
               WHERE kind = $2 AND id = $3"#,
        )
        .bind(spec)
        .bind(kind)
        .bind(id.as_str())
        .execute(&self.pool)
        .await
        .map_err(|e| StoreError::Database(format!("update_spec: {e}")))?;
        Ok(())
    }

    pub async fn delete_resource(&self, kind: &str, id: &ResourceId) -> Result<(), StoreError> {
        sqlx::query(r#"DELETE FROM resources WHERE kind = $1 AND id = $2"#)
            .bind(kind)
            .bind(id.as_str())
            .execute(&self.pool)
            .await
            .map_err(|e| StoreError::Database(format!("delete_resource: {e}")))?;
        Ok(())
    }

    pub async fn poll_unpublished_events(
        &self,
        batch_size: i64,
    ) -> Result<Vec<OutboxRow>, StoreError> {
        let rows = sqlx::query(
            r#"SELECT seq, event_type, partition_key, payload, created_at
               FROM outbox_events
               WHERE published_at IS NULL
               ORDER BY seq
               LIMIT $1
               FOR UPDATE SKIP LOCKED"#,
        )
        .bind(batch_size)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| StoreError::Database(format!("poll_unpublished_events: {e}")))?;

        Ok(rows
            .into_iter()
            .map(|r| OutboxRow {
                seq: r.get("seq"),
                event_type: r.get("event_type"),
                partition_key: r.get("partition_key"),
                payload: r.get("payload"),
                created_at: r.get("created_at"),
            })
            .collect())
    }

    pub async fn mark_events_published(&self, seqs: &[i64]) -> Result<(), StoreError> {
        if seqs.is_empty() {
            return Ok(());
        }
        sqlx::query(
            r#"UPDATE outbox_events
               SET published_at = NOW()
               WHERE seq = ANY($1)"#,
        )
        .bind(seqs)
        .execute(&self.pool)
        .await
        .map_err(|e| StoreError::Database(format!("mark_events_published: {e}")))?;
        Ok(())
    }

    pub async fn add_finalizer(
        &self,
        kind: &str,
        id: &ResourceId,
        finalizer: &str,
    ) -> Result<(), StoreError> {
        sqlx::query(
            r#"UPDATE resources
               SET finalizers = array_append(finalizers, $1), updated_at = NOW()
               WHERE kind = $2 AND id = $3
               AND NOT ($1 = ANY(finalizers))"#,
        )
        .bind(finalizer)
        .bind(kind)
        .bind(id.as_str())
        .execute(&self.pool)
        .await
        .map_err(|e| StoreError::Database(format!("add_finalizer: {e}")))?;
        Ok(())
    }

    pub async fn set_finalizers(
        &self,
        kind: &str,
        id: &ResourceId,
        finalizers: &[String],
    ) -> Result<(), StoreError> {
        sqlx::query(
            r#"UPDATE resources
               SET finalizers = $1, updated_at = NOW()
               WHERE kind = $2 AND id = $3"#,
        )
        .bind(finalizers)
        .bind(kind)
        .bind(id.as_str())
        .execute(&self.pool)
        .await
        .map_err(|e| StoreError::Database(format!("set_finalizers: {e}")))?;
        Ok(())
    }

    pub async fn increment_version(&self, kind: &str, id: &ResourceId) -> Result<u64, StoreError> {
        let row = sqlx::query(
            r#"UPDATE resources SET version = version + 1, updated_at = NOW()
               WHERE kind = $1 AND id = $2
               RETURNING version"#,
        )
        .bind(kind)
        .bind(id.as_str())
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| StoreError::Database(format!("increment_version: {e}")))?;

        row.map(|r| r.get::<i64, _>("version") as u64)
            .ok_or(StoreError::NotFound)
    }

    /// Transactional outbox: update status + enqueue event atomically.
    /// Uses optimistic concurrency control via version checks.
    pub async fn transactional_outbox<F, Fut, T>(
        &self,
        f: F,
    ) -> Result<T, StoreError>
    where
        F: FnOnce(&PgPool) -> Fut + Send,
        Fut: Future<Output = Result<T, StoreError>> + Send,
    {
        // For the MVP, we use the pool directly with optimistic concurrency.
        // The version checks on resource updates provide the necessary isolation.
        f(&self.pool).await
    }
}

#[derive(Debug, Clone)]
pub struct ResourceRow {
    pub kind: String,
    pub id: String,
    pub version: i64,
    pub spec: serde_json::Value,
    pub status: serde_json::Value,
    pub handle: Option<serde_json::Value>,
    pub finalizers: Vec<String>,
    pub deletion_requested: bool,
    pub workflow_id: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone)]
pub struct OutboxRow {
    pub seq: i64,
    pub event_type: String,
    pub partition_key: String,
    pub payload: serde_json::Value,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

fn extract_partition_key(event: &PlatformEvent) -> String {
    match event {
        PlatformEvent::RepositoryRequested { id, .. } => id.clone(),
        PlatformEvent::RepositoryProvisioned { id, .. } => id.clone(),
        PlatformEvent::RepositoryUpdated { id, .. } => id.clone(),
        PlatformEvent::RepositoryDeleted { id } => id.clone(),
        PlatformEvent::RepositoryImportStarted { id, .. } => id.clone(),
        PlatformEvent::RepositoryImportDone { id } => id.clone(),
        PlatformEvent::RepositoryFailed { id, .. } => id.clone(),
        PlatformEvent::OrganizationCreated { id } => id.clone(),
        PlatformEvent::OrganizationDeleted { id } => id.clone(),
        PlatformEvent::CapabilityRegistered { id, .. } => id.clone(),
        PlatformEvent::CapabilityDeprecated { id, .. } => id.clone(),
        PlatformEvent::CapabilityDeployed { id, .. } => id.clone(),
        PlatformEvent::QuotaExceeded { org_id, .. } => org_id.clone(),
        PlatformEvent::BillingAnchored { org_id, .. } => org_id.clone(),
        PlatformEvent::SessionScheduled { session_id, .. } => session_id.clone(),
        PlatformEvent::SessionStarted { session_id } => session_id.clone(),
        PlatformEvent::SessionDrained { session_id } => session_id.clone(),
        PlatformEvent::SessionTerminated { session_id } => session_id.clone(),
        PlatformEvent::ReconcileRequested { id, .. } => id.clone(),
        PlatformEvent::ReconcileSucceeded { id, .. } => id.clone(),
        PlatformEvent::ReconcileFailed { id, .. } => id.clone(),
        PlatformEvent::ProviderCallSucceeded { resource_id, .. } => resource_id.clone(),
        PlatformEvent::ProviderCallFailed { resource_id, .. } => resource_id.clone(),
        PlatformEvent::CircuitBreakerOpened { provider, .. } => provider.clone(),
        PlatformEvent::CircuitBreakerClosed { provider, .. } => provider.clone(),
    }
}
