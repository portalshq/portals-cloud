use persistence::PostgresStateStore;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::info;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowDefinition {
    pub id: String,
    pub kind: WorkflowKind,
    pub state: WorkflowState,
    pub steps: Vec<WorkflowStep>,
    pub current_step: usize,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum WorkflowKind {
    RepositoryImport,
    RepositoryExport,
    GarbageCollection,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum WorkflowState {
    Pending,
    Running,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowStep {
    pub name: String,
    pub status: StepStatus,
    pub input: serde_json::Value,
    pub output: serde_json::Value,
    pub error: Option<String>,
    pub started_at: Option<chrono::DateTime<chrono::Utc>>,
    pub completed_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum StepStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Skipped,
}

pub struct WorkflowOrchestrator {
    store: Arc<PostgresStateStore>,
}

impl WorkflowOrchestrator {
    pub fn new(store: Arc<PostgresStateStore>) -> Self {
        Self { store }
    }

    pub async fn start_repository_import(
        &self,
        repo_id: &str,
        source_url: &str,
    ) -> Result<String, WorkflowError> {
        let workflow_id = format!("import-{}-{}", repo_id, uuid::Uuid::new_v4());

        let steps = vec![
            WorkflowStep {
                name: "validate_source".to_string(),
                status: StepStatus::Pending,
                input: serde_json::json!({ "source_url": source_url }),
                output: serde_json::json!({}),
                error: None,
                started_at: None,
                completed_at: None,
            },
            WorkflowStep {
                name: "create_storage_allocation".to_string(),
                status: StepStatus::Pending,
                input: serde_json::json!({}),
                output: serde_json::json!({}),
                error: None,
                started_at: None,
                completed_at: None,
            },
            WorkflowStep {
                name: "fetch_and_store_chunks".to_string(),
                status: StepStatus::Pending,
                input: serde_json::json!({}),
                output: serde_json::json!({}),
                error: None,
                started_at: None,
                completed_at: None,
            },
            WorkflowStep {
                name: "configure_lore_sync".to_string(),
                status: StepStatus::Pending,
                input: serde_json::json!({}),
                output: serde_json::json!({}),
                error: None,
                started_at: None,
                completed_at: None,
            },
            WorkflowStep {
                name: "verify_integrity".to_string(),
                status: StepStatus::Pending,
                input: serde_json::json!({}),
                output: serde_json::json!({}),
                error: None,
                started_at: None,
                completed_at: None,
            },
        ];

        info!(
            workflow_id = %workflow_id,
            repo_id = %repo_id,
            source_url = %source_url,
            "starting repository import workflow"
        );

        self.store
            .create_resource(
                "Workflow",
                &models::ResourceId::new(&workflow_id),
                &serde_json::json!({
                    "kind": "RepositoryImport",
                    "repo_id": repo_id,
                    "source_url": source_url,
                    "state": "Running",
                    "current_step": 0,
                    "steps": serde_json::to_value(&steps)
                        .map_err(|e| WorkflowError::Parse(format!("failed to serialize steps: {e}")))?,
                }),
                &[],
            )
            .await
            .map_err(|e| WorkflowError::Persistence(e.to_string()))?;

        Ok(workflow_id)
    }

    pub async fn advance_workflow(
        &self,
        workflow_id: &str,
    ) -> Result<WorkflowState, WorkflowError> {
        let row = self
            .store
            .get_resource_raw(
                "Workflow",
                &models::ResourceId::new(workflow_id),
            )
            .await
            .map_err(|e| WorkflowError::Persistence(e.to_string()))?
            .ok_or_else(|| WorkflowError::NotFound(workflow_id.to_string()))?;

        let current_step: usize = row
            .spec
            .get("current_step")
            .and_then(|v| v.as_u64())
            .map(|v| v as usize)
            .unwrap_or(0);

        let steps: Vec<WorkflowStep> = serde_json::from_value(
            row.spec
                .get("steps")
                .cloned()
                .unwrap_or(serde_json::json!([])),
        )
        .map_err(|e| WorkflowError::Parse(e.to_string()))?;

        if current_step >= steps.len() {
            info!(workflow_id = %workflow_id, "workflow already completed");
            return Ok(WorkflowState::Completed);
        }

        let step = &steps[current_step];
        info!(
            workflow_id = %workflow_id,
            step_name = %step.name,
            step_index = current_step,
            "advancing workflow step"
        );

        // In a real implementation, each step would call a provider.
        // For the MVP, we mark each step as completed.
        let mut updated_steps = steps.clone();
        updated_steps[current_step].status = StepStatus::Completed;
        updated_steps[current_step].completed_at = Some(chrono::Utc::now());

        let next_step = current_step + 1;
        let new_state = if next_step >= updated_steps.len() {
            "Completed"
        } else {
            "Running"
        };

        self.store
            .update_spec(
                "Workflow",
                &models::ResourceId::new(workflow_id),
                &serde_json::json!({
                    "kind": "RepositoryImport",
                    "state": new_state,
                    "current_step": next_step,
                    "steps": serde_json::to_value(&updated_steps)
                        .map_err(|e| WorkflowError::Parse(format!("failed to serialize steps: {e}")))?,
                }),
            )
            .await
            .map_err(|e| WorkflowError::Persistence(e.to_string()))?;

        if new_state == "Completed" {
            info!(workflow_id = %workflow_id, "workflow completed");
            Ok(WorkflowState::Completed)
        } else {
            Ok(WorkflowState::Running)
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum WorkflowError {
    #[error("Workflow not found: {0}")]
    NotFound(String),
    #[error("Persistence error: {0}")]
    Persistence(String),
    #[error("Parse error: {0}")]
    Parse(String),
    #[error("Provider error: {0}")]
    Provider(String),
}
