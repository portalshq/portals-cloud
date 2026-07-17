//! Mock provider for testing — in-memory with configurable failure injection.
//!
//! Used for unit tests, controller logic tests, and local development.

use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use async_trait::async_trait;
use control_plane_provider_trait::{
    InfrastructureProvider, RepositoryProvider, StorageProvider, ComputeProvider,
    IdentityProvider, NetworkingProvider, SecretProvider,
    RepositorySpec, RepositoryHandle, RepositoryStatus, RepositorySpecPatch,
    StorageAllocationSpec, StorageAllocation, StorageUsage,
    ComputeSpec, ComputeHandle, ComputeStatus,
    NamespaceSpec, Namespace, CredentialSpec, Token,
    EndpointSpec, Endpoint,
    SecretKey, SecretValue,
    ProviderError,
};
use reconciler::ResourceId;
use chrono::{DateTime, Utc, Duration};

/// Mock provider configuration.
#[derive(Debug, Clone)]
pub struct MockProviderConfig {
    pub inject_failures: bool,
    pub failure_rate: f64,
}

impl Default for MockProviderConfig {
    fn default() -> Self {
        Self {
            inject_failures: false,
            failure_rate: 0.0,
        }
    }
}

/// Mock repository provider.
pub struct MockRepositoryProvider {
    repositories: Arc<Mutex<HashMap<ResourceId, RepositoryHandle>>>,
    config: MockProviderConfig,
}

impl MockRepositoryProvider {
    pub fn new(config: MockProviderConfig) -> Self {
        Self {
            repositories: Arc::new(Mutex::new(HashMap::new())),
            config,
        }
    }

    fn maybe_fail(&self) -> Result<(), ProviderError> {
        if self.config.inject_failures && rand::random::<f64>() < self.config.failure_rate {
            Err(ProviderError::Unavailable("Injected failure".to_string()))
        } else {
            Ok(())
        }
    }
}

#[async_trait]
impl RepositoryProvider for MockRepositoryProvider {
    async fn provision(&self, spec: &RepositorySpec) -> Result<RepositoryHandle, ProviderError> {
        self.maybe_fail()?;
        
        let handle = RepositoryHandle {
            id: ResourceId::new(uuid::Uuid::new_v4().to_string()),
            bucket_name: format!("mock-bucket-{}", spec.name),
            region: spec.region.clone(),
            arn: format!("arn:aws:s3:::mock-bucket-{}", spec.name),
            created_at: Utc::now(),
        };

        self.repositories.lock().unwrap().insert(handle.id.clone(), handle.clone());
        Ok(handle)
    }

    async fn deprovision(&self, handle: &RepositoryHandle) -> Result<(), ProviderError> {
        self.maybe_fail()?;
        self.repositories.lock().unwrap().remove(&handle.id);
        Ok(())
    }

    async fn describe(&self, handle: &RepositoryHandle) -> Result<RepositoryStatus, ProviderError> {
        self.maybe_fail()?;
        let repositories = self.repositories.lock().unwrap();
        if !repositories.contains_key(&handle.id) {
            return Err(ProviderError::NotFound(format!("Repository {} not found", handle.id.as_str())));
        }
        Ok(RepositoryStatus {
            handle: handle.clone(),
            size_bytes: 0,
            object_count: 0,
            last_modified: Utc::now(),
        })
    }

    async fn update(&self, _handle: &RepositoryHandle, _patch: &RepositorySpecPatch) -> Result<(), ProviderError> {
        self.maybe_fail()?;
        Ok(())
    }

    async fn health_check(&self) -> Result<(), ProviderError> {
        Ok(())
    }

    async fn list_resources(&self) -> Result<Vec<RepositoryHandle>, ProviderError> {
        Ok(self.repositories.lock().unwrap().values().cloned().collect())
    }
}

/// Mock storage provider.
pub struct MockStorageProvider {
    allocations: Arc<Mutex<HashMap<ResourceId, StorageAllocation>>>,
    config: MockProviderConfig,
}

impl MockStorageProvider {
    pub fn new(config: MockProviderConfig) -> Self {
        Self {
            allocations: Arc::new(Mutex::new(HashMap::new())),
            config,
        }
    }
}

#[async_trait]
impl StorageProvider for MockStorageProvider {
    async fn allocate(&self, spec: &StorageAllocationSpec) -> Result<StorageAllocation, ProviderError> {
        let allocation = StorageAllocation {
            id: ResourceId::new(uuid::Uuid::new_v4().to_string()),
            bucket_name: format!("mock-storage-{}", uuid::Uuid::new_v4()),
            quota_bytes: spec.quota_bytes,
            tier: spec.tier.clone(),
            region: spec.region.clone(),
        };

        self.allocations.lock().unwrap().insert(allocation.id.clone(), allocation.clone());
        Ok(allocation)
    }

    async fn deallocate(&self, allocation: &StorageAllocation) -> Result<(), ProviderError> {
        self.allocations.lock().unwrap().remove(&allocation.id);
        Ok(())
    }

    async fn describe(&self, allocation: &StorageAllocation) -> Result<StorageUsage, ProviderError> {
        Ok(StorageUsage {
            allocation: allocation.clone(),
            used_bytes: 0,
            object_count: 0,
        })
    }

    async fn resize(&self, _allocation: &StorageAllocation, _new_quota_bytes: u64) -> Result<(), ProviderError> {
        Ok(())
    }

    async fn health_check(&self) -> Result<(), ProviderError> {
        Ok(())
    }

    async fn list_resources(&self) -> Result<Vec<StorageAllocation>, ProviderError> {
        Ok(self.allocations.lock().unwrap().values().cloned().collect())
    }
}

/// Mock compute provider.
pub struct MockComputeProvider {
    tasks: Arc<Mutex<HashMap<ResourceId, ComputeHandle>>>,
    config: MockProviderConfig,
}

impl MockComputeProvider {
    pub fn new(config: MockProviderConfig) -> Self {
        Self {
            tasks: Arc::new(Mutex::new(HashMap::new())),
            config,
        }
    }
}

#[async_trait]
impl ComputeProvider for MockComputeProvider {
    async fn schedule(&self, spec: &ComputeSpec) -> Result<ComputeHandle, ProviderError> {
        let handle = ComputeHandle {
            id: ResourceId::new(uuid::Uuid::new_v4().to_string()),
            task_arn: format!("arn:aws:ecs:task:{}", uuid::Uuid::new_v4()),
            cluster: "mock-cluster".to_string(),
            region: spec.region.clone(),
        };

        self.tasks.lock().unwrap().insert(handle.id.clone(), handle.clone());
        Ok(handle)
    }

    async fn terminate(&self, handle: &ComputeHandle) -> Result<(), ProviderError> {
        self.tasks.lock().unwrap().remove(&handle.id);
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
        Ok(())
    }

    async fn list_resources(&self) -> Result<Vec<ComputeHandle>, ProviderError> {
        Ok(self.tasks.lock().unwrap().values().cloned().collect())
    }
}

/// Mock identity provider.
pub struct MockIdentityProvider {
    namespaces: Arc<Mutex<HashMap<ResourceId, Namespace>>>,
    config: MockProviderConfig,
}

impl MockIdentityProvider {
    pub fn new(config: MockProviderConfig) -> Self {
        Self {
            namespaces: Arc::new(Mutex::new(HashMap::new())),
            config,
        }
    }
}

#[async_trait]
impl IdentityProvider for MockIdentityProvider {
    async fn create_namespace(&self, spec: &NamespaceSpec) -> Result<Namespace, ProviderError> {
        let namespace = Namespace {
            id: ResourceId::new(uuid::Uuid::new_v4().to_string()),
            org_id: spec.org_id.clone(),
            name: spec.name.clone(),
            role_arn: format!("arn:aws:iam:::role/{}", spec.name),
        };

        self.namespaces.lock().unwrap().insert(namespace.id.clone(), namespace.clone());
        Ok(namespace)
    }

    async fn issue_credential(&self, spec: &CredentialSpec) -> Result<Token, ProviderError> {
        Ok(Token {
            token: format!("mock-token-{}", uuid::Uuid::new_v4()),
            expires_at: Utc::now() + Duration::seconds(spec.ttl_seconds as i64),
        })
    }

    async fn revoke(&self, _token: &Token) -> Result<(), ProviderError> {
        Ok(())
    }

    async fn health_check(&self) -> Result<(), ProviderError> {
        Ok(())
    }

    async fn list_resources(&self) -> Result<Vec<Namespace>, ProviderError> {
        Ok(self.namespaces.lock().unwrap().values().cloned().collect())
    }
}

/// Mock networking provider.
pub struct MockNetworkingProvider {
    endpoints: Arc<Mutex<HashMap<ResourceId, Endpoint>>>,
    config: MockProviderConfig,
}

impl MockNetworkingProvider {
    pub fn new(config: MockProviderConfig) -> Self {
        Self {
            endpoints: Arc::new(Mutex::new(HashMap::new())),
            config,
        }
    }
}

#[async_trait]
impl NetworkingProvider for MockNetworkingProvider {
    async fn register_endpoint(&self, spec: &EndpointSpec) -> Result<Endpoint, ProviderError> {
        let endpoint = Endpoint {
            id: ResourceId::new(uuid::Uuid::new_v4().to_string()),
            name: spec.name.clone(),
            dns_name: spec.dns_name.clone(),
            addresses: vec![spec.target.clone()],
        };

        self.endpoints.lock().unwrap().insert(endpoint.id.clone(), endpoint.clone());
        Ok(endpoint)
    }

    async fn deregister(&self, endpoint: &Endpoint) -> Result<(), ProviderError> {
        self.endpoints.lock().unwrap().remove(&endpoint.id);
        Ok(())
    }

    async fn resolve(&self, _name: &str) -> Result<Vec<String>, ProviderError> {
        Ok(vec![])
    }

    async fn health_check(&self) -> Result<(), ProviderError> {
        Ok(())
    }

    async fn list_resources(&self) -> Result<Vec<Endpoint>, ProviderError> {
        Ok(self.endpoints.lock().unwrap().values().cloned().collect())
    }
}

/// Mock secret provider.
pub struct MockSecretProvider {
    secrets: Arc<Mutex<HashMap<SecretKey, SecretValue>>>,
    config: MockProviderConfig,
}

impl MockSecretProvider {
    pub fn new(config: MockProviderConfig) -> Self {
        Self {
            secrets: Arc::new(Mutex::new(HashMap::new())),
            config,
        }
    }
}

#[async_trait]
impl SecretProvider for MockSecretProvider {
    async fn get(&self, key: &SecretKey) -> Result<SecretValue, ProviderError> {
        self.secrets
            .lock()
            .unwrap()
            .get(key)
            .cloned()
            .ok_or_else(|| ProviderError::NotFound("Secret not found".to_string()))
    }

    async fn set(
        &self,
        key: &SecretKey,
        value: &SecretValue,
        _ttl: Option<std::time::Duration>,
    ) -> Result<(), ProviderError> {
        self.secrets.lock().unwrap().insert(key.clone(), value.clone());
        Ok(())
    }

    async fn rotate(&self, key: &SecretKey) -> Result<SecretValue, ProviderError> {
        let new_value = SecretValue {
            value: format!("rotated-{}", uuid::Uuid::new_v4()),
            version: "2".to_string(),
        };
        self.secrets.lock().unwrap().insert(key.clone(), new_value.clone());
        Ok(new_value)
    }

    async fn revoke(&self, key: &SecretKey) -> Result<(), ProviderError> {
        self.secrets.lock().unwrap().remove(key);
        Ok(())
    }

    async fn health_check(&self) -> Result<(), ProviderError> {
        Ok(())
    }
}

/// Create mock infrastructure provider.
pub fn create_mock_provider(config: MockProviderConfig) -> InfrastructureProvider {
    InfrastructureProvider {
        repository: Arc::new(MockRepositoryProvider::new(config.clone())) as Arc<dyn RepositoryProvider>,
        storage: Arc::new(MockStorageProvider::new(config.clone())) as Arc<dyn StorageProvider>,
        compute: Arc::new(MockComputeProvider::new(config.clone())) as Arc<dyn ComputeProvider>,
        identity: Arc::new(MockIdentityProvider::new(config.clone())) as Arc<dyn IdentityProvider>,
        networking: Arc::new(MockNetworkingProvider::new(config.clone())) as Arc<dyn NetworkingProvider>,
        secrets: Arc::new(MockSecretProvider::new(config)) as Arc<dyn SecretProvider>,
    }
}
