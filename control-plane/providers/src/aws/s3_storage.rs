use crate::r#trait::repository::*;
use crate::r#trait::ProviderError;
use async_trait::async_trait;
use reqwest::Client;
use tracing::{debug, info};

pub struct S3StorageProvider {
    endpoint: String,
    #[allow(dead_code)]
    access_key: String,
    #[allow(dead_code)]
    secret_key: String,
    #[allow(dead_code)]
    region: String,
    bucket: String,
    client: Client,
    path_style: bool,
}

impl S3StorageProvider {
    pub fn new(
        endpoint: String,
        access_key: String,
        secret_key: String,
        region: String,
        bucket: String,
        path_style: bool,
    ) -> Self {
        let client = Client::new();
        Self {
            endpoint,
            access_key,
            secret_key,
            region,
            bucket,
            client,
            path_style,
        }
    }

    fn bucket_url(&self, bucket: &str) -> String {
        if self.path_style {
            format!("{}/{}", self.endpoint, bucket)
        } else {
            format!("{}.{}", self.endpoint, bucket)
        }
    }

    fn repo_prefix(&self, spec: &RepositorySpec) -> String {
        format!("repos/{}", spec.name)
    }

    async fn ensure_bucket_exists(&self) -> Result<(), ProviderError> {
        let url = self.bucket_url(&self.bucket);
        let response = self
            .client
            .put(&url)
            .header("Host", format!("{}:9002", self.bucket))
            .send()
            .await
            .map_err(|e| ProviderError::ApiError(format!("ensure_bucket: {e}")))?;

        if response.status().is_success() || response.status().as_u16() == 409 {
            Ok(())
        } else {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            Err(ProviderError::ApiError(format!(
                "ensure_bucket failed ({status}): {body}"
            )))
        }
    }

    async fn put_object(
        &self,
        key: &str,
        data: &[u8],
        content_type: &str,
    ) -> Result<(), ProviderError> {
        let url = if self.path_style {
            format!("{}/{}/{}", self.endpoint, self.bucket, key)
        } else {
            format!("https://{}.{}/{}", self.bucket, self.endpoint.trim_start_matches("http://").trim_start_matches("https://"), key)
        };

        let response = self
            .client
            .put(&url)
            .header("Content-Type", content_type)
            .body(data.to_vec())
            .send()
            .await
            .map_err(|e| ProviderError::ApiError(format!("put_object: {e}")))?;

        if response.status().is_success() {
            Ok(())
        } else {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            Err(ProviderError::ApiError(format!(
                "put_object failed ({status}): {body}"
            )))
        }
    }

    async fn delete_prefix(&self, prefix: &str) -> Result<(), ProviderError> {
        // List objects with prefix and delete them
        let list_url = if self.path_style {
            format!(
                "{}/{}/?list-type=2&prefix={}",
                self.endpoint, self.bucket, prefix
            )
        } else {
            format!(
                "https://{}/?list-type=2&prefix={}",
                self.bucket, prefix
            )
        };

        let response = self
            .client
            .get(&list_url)
            .send()
            .await
            .map_err(|e| ProviderError::ApiError(format!("list_objects: {e}")))?;

        if !response.status().is_success() {
            return Err(ProviderError::ApiError(format!(
                "list_objects failed: {}",
                response.status()
            )));
        }

        let body: serde_json::Value = response
            .json()
            .await
            .map_err(|e| ProviderError::ApiError(format!("parse list response: {e}")))?;

        let contents = body
            .get("Contents")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        for obj in contents {
            if let Some(key) = obj.get("Key").and_then(|v| v.as_str()) {
                let delete_url = if self.path_style {
                    format!("{}/{}/{}", self.endpoint, self.bucket, key)
                } else {
                    format!("https://{}/{}", self.bucket, key)
                };

                let _ = self.client.delete(&delete_url).send().await;
            }
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

        // Create a marker object to indicate the repo exists
        let marker_key = format!("{}/.lorecloud/marker.json", prefix);
        let marker_data = serde_json::json!({
            "name": spec.name,
            "storage_tier": spec.storage_tier,
            "created_at": chrono::Utc::now().to_rfc3339(),
        });

        self.put_object(
            &marker_key,
            &serde_json::to_vec_pretty(&marker_data).unwrap(),
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
        // Check if the marker object exists
        let marker_key = format!("{}/.lorecloud/marker.json", handle.prefix);
        let url = if self.path_style {
            format!("{}/{}/{}", self.endpoint, self.bucket, marker_key)
        } else {
            format!(
                "https://{}/{}",
                self.bucket, marker_key
            )
        };

        let response = self
            .client
            .head(&url)
            .send()
            .await
            .map_err(|e| ProviderError::ApiError(format!("head_object: {e}")))?;

        Ok(RepositoryStatus {
            ready: response.status().is_success(),
        })
    }

    async fn update(
        &self,
        _handle: &RepositoryHandle,
        _patch: &serde_json::Value,
    ) -> Result<(), ProviderError> {
        Ok(())
    }

    async fn health_check(&self) -> Result<(), ProviderError> {
        let url = if self.path_style {
            format!("{}/", self.endpoint)
        } else {
            format!("{}/", self.endpoint)
        };

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| ProviderError::ApiError(format!("health check: {e}")))?;

        if response.status().is_success() || response.status().as_u16() == 403 {
            Ok(())
        } else {
            Err(ProviderError::ApiError(format!(
                "S3 health check failed: {}",
                response.status()
            )))
        }
    }

    async fn list_resources(&self) -> Result<Vec<RepositoryHandle>, ProviderError> {
        Ok(vec![])
    }
}
