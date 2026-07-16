//! AWS S3 storage provider implementation.

use aws_sdk_s3::Client;
use aws_config::SdkConfig;
use control_plane_provider_trait::{
    StorageProvider, StorageAllocationSpec, StorageAllocation, StorageUsage,
    ProviderError,
};
use reconciler::ResourceId;
use chrono::{DateTime, Utc};

pub struct AwsStorageProvider {
    client: Arc<Client>,
}

impl AwsStorageProvider {
    pub fn new(config: SdkConfig) -> Self {
        let client = Arc::new(Client::new(&config));
        Self { client }
    }
}

#[async_trait::async_trait]
impl StorageProvider for AwsStorageProvider {
    async fn allocate(&self, spec: &StorageAllocationSpec) -> Result<StorageAllocation, ProviderError> {
        let bucket_name = format!("lore-storage-{}-{}", uuid::Uuid::new_v4(), spec.tier);

        // Create bucket with tier-specific configuration
        Ok(StorageAllocation {
            id: ResourceId::new(bucket_name.clone()),
            bucket_name,
            quota_bytes: spec.quota_bytes,
            tier: spec.tier.clone(),
            region: spec.region.clone(),
        })
    }

    async fn deallocate(&self, allocation: &StorageAllocation) -> Result<(), ProviderError> {
        self.client
            .delete_bucket()
            .bucket(&allocation.bucket_name)
            .send()
            .await
            .map_err(|e| ProviderError::OperationFailed(format!("S3 delete_bucket: {}", e)))?;
        Ok(())
    }

    async fn describe(&self, allocation: &StorageAllocation) -> Result<StorageUsage, ProviderError> {
        Ok(StorageUsage {
            allocation: allocation.clone(),
            used_bytes: 0,
            object_count: 0,
        })
    }

    async fn resize(&self, allocation: &StorageAllocation, new_quota_bytes: u64) -> Result<(), ProviderError> {
        // Update quota configuration
        Ok(())
    }

    async fn health_check(&self) -> Result<(), ProviderError> {
        self.client
            .list_buckets()
            .send()
            .await
            .map_err(|e| ProviderError::Unavailable(format!("S3 health check failed: {}", e)))?;
        Ok(())
    }

    async fn list_resources(&self) -> Result<Vec<StorageAllocation>, ProviderError> {
        Ok(vec![])
    }
}
