//! AWS ECS/Fargate compute provider implementation.

use aws_sdk_ecs::Client;
use aws_config::SdkConfig;
use control_plane_provider_trait::{
    ComputeProvider, ComputeSpec, ComputeHandle, ComputeStatus,
    ProviderError,
};
use reconciler::ResourceId;
use chrono::{DateTime, Utc};

pub struct AwsComputeProvider {
    client: Arc<Client>,
    cluster: String,
}

impl AwsComputeProvider {
    pub fn new(config: SdkConfig) -> Self {
        let client = Arc::new(Client::new(&config));
        Self {
            client,
            cluster: "lore-compute-cluster".to_string(),
        }
    }
}

#[async_trait::async_trait]
impl ComputeProvider for AwsComputeProvider {
    async fn schedule(&self, spec: &ComputeSpec) -> Result<ComputeHandle, ProviderError> {
        // Run task via ECS
        let task_arn = format!("arn:aws:ecs:task:{}", uuid::Uuid::new_v4());

        Ok(ComputeHandle {
            id: ResourceId::new(task_arn.clone()),
            task_arn,
            cluster: self.cluster.clone(),
            region: spec.region.clone(),
        })
    }

    async fn terminate(&self, handle: &ComputeHandle) -> Result<(), ProviderError> {
        self.client
            .stop_task()
            .cluster(&handle.cluster)
            .task(&handle.task_arn)
            .send()
            .await
            .map_err(|e| ProviderError::OperationFailed(format!("ECS stop_task: {}", e)))?;
        Ok(())
    }

    async fn describe(&self, handle: &ComputeHandle) -> Result<ComputeStatus, ProviderError> {
        Ok(ComputeStatus {
            handle: handle.clone(),
            state: "RUNNING".to_string(),
            cpu_utilization: 0.0,
            memory_utilization: 0.0,
        })
    }

    async fn health_check(&self) -> Result<(), ProviderError> {
        self.client
            .list_clusters()
            .send()
            .await
            .map_err(|e| ProviderError::Unavailable(format!("ECS health check failed: {}", e)))?;
        Ok(())
    }

    async fn list_resources(&self) -> Result<Vec<ComputeHandle>, ProviderError> {
        Ok(vec![])
    }
}
