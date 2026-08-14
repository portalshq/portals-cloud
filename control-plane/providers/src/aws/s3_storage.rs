use crate::r#trait::repository::*;
use crate::r#trait::ProviderError;
use async_trait::async_trait;
use aws_config::{BehaviorVersion, Region};
use aws_sdk_s3::config::{Builder as S3ConfigBuilder, Credentials};
use aws_sdk_s3::primitives::ByteStream;
use tracing::{debug, info};

/// Repository marker storage backed by the official AWS SDK.
///
/// Empty access/secret values intentionally select the default AWS credential
/// chain (ECS task roles in production). Explicit credentials remain available
/// for isolated MinIO development only.
pub struct S3StorageProvider {
    bucket: String,
    client: aws_sdk_s3::Client,
    allow_bucket_creation: bool,
}

impl S3StorageProvider {
    pub async fn new(
        endpoint: String,
        access_key: String,
        secret_key: String,
        region: String,
        bucket: String,
        path_style: bool,
    ) -> Result<Self, ProviderError> {
        if access_key.is_empty() != secret_key.is_empty() {
            return Err(ProviderError::ApiError(
                "S3 access key and secret must both be set or both be empty".to_string(),
            ));
        }

        let mut loader =
            aws_config::defaults(BehaviorVersion::latest()).region(Region::new(region.clone()));
        if !access_key.is_empty() {
            loader = loader.credentials_provider(Credentials::new(
                access_key,
                secret_key,
                None,
                None,
                "explicit-local-development",
            ));
        }
        let shared = loader.load().await;
        let mut builder = S3ConfigBuilder::from(&shared)
            .region(Region::new(region))
            .force_path_style(path_style);
        if !endpoint.is_empty() {
            builder = builder.endpoint_url(endpoint);
        }

        Ok(Self {
            bucket,
            client: aws_sdk_s3::Client::from_conf(builder.build()),
            allow_bucket_creation: path_style,
        })
    }

    fn repo_prefix(&self, spec: &RepositorySpec) -> String {
        format!("repos/{}", spec.name)
    }

    async fn ensure_bucket_exists(&self) -> Result<(), ProviderError> {
        if self
            .client
            .head_bucket()
            .bucket(&self.bucket)
            .send()
            .await
            .is_ok()
        {
            return Ok(());
        }
        if !self.allow_bucket_creation {
            return Err(ProviderError::ApiError(format!(
                "configured S3 bucket '{}' is unavailable; production never creates buckets at runtime",
                self.bucket
            )));
        }
        self.client
            .create_bucket()
            .bucket(&self.bucket)
            .send()
            .await
            .map_err(|e| ProviderError::ApiError(format!("create_bucket: {e}")))?;
        Ok(())
    }

    async fn put_object(
        &self,
        key: &str,
        data: &[u8],
        content_type: &str,
    ) -> Result<(), ProviderError> {
        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(key)
            .content_type(content_type)
            .body(ByteStream::from(data.to_vec()))
            .send()
            .await
            .map_err(|e| ProviderError::ApiError(format!("put_object: {e}")))?;
        Ok(())
    }

    async fn delete_prefix(&self, prefix: &str) -> Result<(), ProviderError> {
        let mut continuation = None;
        loop {
            let result = self
                .client
                .list_objects_v2()
                .bucket(&self.bucket)
                .prefix(prefix)
                .set_continuation_token(continuation)
                .send()
                .await
                .map_err(|e| ProviderError::ApiError(format!("list_objects: {e}")))?;
            for object in result.contents() {
                if let Some(key) = object.key() {
                    self.client
                        .delete_object()
                        .bucket(&self.bucket)
                        .key(key)
                        .send()
                        .await
                        .map_err(|e| ProviderError::ApiError(format!("delete_object: {e}")))?;
                }
            }
            if result.is_truncated() != Some(true) {
                break;
            }
            continuation = result.next_continuation_token().map(ToOwned::to_owned);
        }
        Ok(())
    }
}

#[async_trait]
impl RepositoryProvider for S3StorageProvider {
    async fn provision(&self, spec: &RepositorySpec) -> Result<RepositoryHandle, ProviderError> {
        info!(name = %spec.name, "provisioning S3 storage for repository");
        self.ensure_bucket_exists().await?;
        let prefix = self.repo_prefix(spec);
        let marker_key = format!("{prefix}/.lorecloud/marker.json");
        let marker_data = serde_json::json!({
            "name": spec.name,
            "storage_tier": spec.storage_tier,
            "created_at": chrono::Utc::now().to_rfc3339(),
        });
        self.put_object(
            &marker_key,
            &serde_json::to_vec_pretty(&marker_data).expect("marker serializes"),
            "application/json",
        )
        .await?;
        let handle = RepositoryHandle {
            bucket: self.bucket.clone(),
            prefix,
        };
        debug!(bucket = %handle.bucket, prefix = %handle.prefix, "S3 storage provisioned");
        Ok(handle)
    }

    async fn deprovision(&self, handle: &RepositoryHandle) -> Result<(), ProviderError> {
        info!(bucket = %handle.bucket, prefix = %handle.prefix, "deprovisioning S3 storage");
        self.delete_prefix(&handle.prefix).await
    }

    async fn describe(&self, handle: &RepositoryHandle) -> Result<RepositoryStatus, ProviderError> {
        let marker_key = format!("{}/.lorecloud/marker.json", handle.prefix);
        let ready = self
            .client
            .head_object()
            .bucket(&handle.bucket)
            .key(marker_key)
            .send()
            .await
            .is_ok();
        Ok(RepositoryStatus { ready })
    }

    async fn update(
        &self,
        _handle: &RepositoryHandle,
        _patch: &serde_json::Value,
    ) -> Result<(), ProviderError> {
        Ok(())
    }

    async fn health_check(&self) -> Result<(), ProviderError> {
        self.client
            .head_bucket()
            .bucket(&self.bucket)
            .send()
            .await
            .map_err(|e| ProviderError::ApiError(format!("S3 health check failed: {e}")))?;
        Ok(())
    }

    async fn list_resources(&self) -> Result<Vec<RepositoryHandle>, ProviderError> {
        Ok(vec![])
    }
}
