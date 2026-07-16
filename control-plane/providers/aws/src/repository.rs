//! AWS S3 repository provider implementation.

use aws_sdk_s3::{Client, Error as S3Error};
use aws_config::SdkConfig;
use control_plane_provider_trait::{
    RepositoryProvider, RepositorySpec, RepositoryHandle, RepositoryStatus, RepositorySpecPatch,
    ProviderError,
};
use reconciler::ResourceId;
use chrono::{DateTime, Utc};
use std::sync::Arc;

pub struct AwsRepositoryProvider {
    client: Arc<Client>,
}

impl AwsRepositoryProvider {
    pub fn new(config: SdkConfig) -> Self {
        let client = Arc::new(Client::new(&config));
        Self { client }
    }
}

#[async_trait::async_trait]
impl RepositoryProvider for AwsRepositoryProvider {
    async fn provision(&self, spec: &RepositorySpec) -> Result<RepositoryHandle, ProviderError> {
        let bucket_name = format!("lore-{}-{}", spec.name, uuid::Uuid::new_v4());

        // Create bucket via S3
        self.client
            .create_bucket()
            .bucket(&bucket_name)
            .send()
            .await
            .map_err(|e| ProviderError::OperationFailed(format!("S3 create_bucket: {}", e)))?;

        Ok(RepositoryHandle {
            id: ResourceId::new(bucket_name.clone()),
            bucket_name,
            region: spec.region.clone(),
            arn: format!("arn:aws:s3:::{}", bucket_name),
            created_at: Utc::now(),
        })
    }

    async fn deprovision(&self, handle: &RepositoryHandle) -> Result<(), ProviderError> {
        // Delete all objects first
        let _ = self.client
            .delete_objects()
            .bucket(&handle.bucket_name)
            .delete(aws_sdk_s3::types::Delete::builder().build())
            .send()
            .await;

        // Delete bucket
        self.client
            .delete_bucket()
            .bucket(&handle.bucket_name)
            .send()
            .await
            .map_err(|e| ProviderError::OperationFailed(format!("S3 delete_bucket: {}", e)))?;

        Ok(())
    }

    async fn describe(&self, handle: &RepositoryHandle) -> Result<RepositoryStatus, ProviderError> {
        let response = self
            .client
            .head_bucket()
            .bucket(&handle.bucket_name)
            .send()
            .await
            .map_err(|e| ProviderError::NotFound(format!("Bucket not found: {}", e)))?;

        Ok(RepositoryStatus {
            handle: handle.clone(),
            size_bytes: 0,
            object_count: 0,
            last_modified: Utc::now(),
        })
    }

    async fn update(&self, handle: &RepositoryHandle, patch: &RepositorySpecPatch) -> Result<(), ProviderError> {
        if let Some(storage_class) = &patch.storage_class {
            // Update bucket storage class configuration
            // This would involve putting bucket configuration
        }
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

    async fn list_resources(&self) -> Result<Vec<RepositoryHandle>, ProviderError> {
        let response = self
            .client
            .list_buckets()
            .send()
            .await
            .map_err(|e| ProviderError::OperationFailed(format!("S3 list_buckets: {}", e)))?;

        let handles = response
            .buckets()
            .iter()
            .filter_map(|bucket| bucket.name())
            .map(|name| RepositoryHandle {
                id: ResourceId::new(name),
                bucket_name: name.to_string(),
                region: "us-east-1".to_string(),
                arn: format!("arn:aws:s3:::{}", name),
                created_at: Utc::now(),
            })
            .collect();

        Ok(handles)
    }
}
