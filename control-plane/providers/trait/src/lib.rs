//! Control plane provider traits — cloud provider interface layer.
//!
//! This crate defines the provider traits that abstract cloud infrastructure.
//! Controllers depend only on these traits, never on aws-sdk-* directly.

use std::sync::Arc;
use async_trait::async_trait;
use thiserror::Error;
use serde::{Serialize, Deserialize};
use chrono::{DateTime, Utc};
use uuid::Uuid;
use reconciler::ResourceId;

/// Provider error types.
#[derive(Debug, Error)]
pub enum ProviderError {
    #[error("resource not found: {0}")]
    NotFound(String),
    #[error("provider unavailable: {0}")]
    Unavailable(String),
    #[error("operation failed: {0}")]
    OperationFailed(String),
    #[error("circuit breaker open for provider: {provider}, retry after: {retry_after:?}")]
    CircuitOpen {
        provider: String,
        retry_after: std::time::Duration,
    },
    #[error("quota exceeded: {0}")]
    QuotaExceeded(String),
    #[error("invalid configuration: {0}")]
    InvalidConfig(String),
}

// ============================================================================
// Repository Provider
// ============================================================================

/// Repository specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepositorySpec {
    pub name: String,
    pub storage_class: String,
    pub region: String,
    pub tags: Vec<(String, String)>,
}

/// Repository handle.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepositoryHandle {
    pub id: ResourceId,
    pub bucket_name: String,
    pub region: String,
    pub arn: String,
    pub created_at: DateTime<Utc>,
}

/// Repository status.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepositoryStatus {
    pub handle: RepositoryHandle,
    pub size_bytes: u64,
    pub object_count: u64,
    pub last_modified: DateTime<Utc>,
}

/// Repository patch for updates.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepositorySpecPatch {
    pub storage_class: Option<String>,
    pub tags: Option<Vec<(String, String)>>,
}

/// Repository provider trait.
#[async_trait]
pub trait RepositoryProvider: Send + Sync {
    async fn provision(&self, spec: &RepositorySpec) -> Result<RepositoryHandle, ProviderError>;
    async fn deprovision(&self, handle: &RepositoryHandle) -> Result<(), ProviderError>;
    async fn describe(&self, handle: &RepositoryHandle) -> Result<RepositoryStatus, ProviderError>;
    async fn update(&self, handle: &RepositoryHandle, patch: &RepositorySpecPatch) -> Result<(), ProviderError>;
    async fn health_check(&self) -> Result<(), ProviderError>;
    async fn list_resources(&self) -> Result<Vec<RepositoryHandle>, ProviderError>;
}

// ============================================================================
// Storage Provider
// ============================================================================

/// Storage allocation specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageAllocationSpec {
    pub quota_bytes: u64,
    pub tier: String,
    pub region: String,
}

/// Storage allocation handle.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageAllocation {
    pub id: ResourceId,
    pub bucket_name: String,
    pub quota_bytes: u64,
    pub tier: String,
    pub region: String,
}

/// Storage usage information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageUsage {
    pub allocation: StorageAllocation,
    pub used_bytes: u64,
    pub object_count: u64,
}

/// Storage provider trait.
#[async_trait]
pub trait StorageProvider: Send + Sync {
    async fn allocate(&self, spec: &StorageAllocationSpec) -> Result<StorageAllocation, ProviderError>;
    async fn deallocate(&self, allocation: &StorageAllocation) -> Result<(), ProviderError>;
    async fn describe(&self, allocation: &StorageAllocation) -> Result<StorageUsage, ProviderError>;
    async fn resize(&self, allocation: &StorageAllocation, new_quota_bytes: u64) -> Result<(), ProviderError>;
    async fn health_check(&self) -> Result<(), ProviderError>;
    async fn list_resources(&self) -> Result<Vec<StorageAllocation>, ProviderError>;
}

// ============================================================================
// Compute Provider
// ============================================================================

/// Compute specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComputeSpec {
    pub cpu: u32,
    pub memory_mb: u32,
    pub image: String,
    pub environment: Vec<(String, String)>,
    pub region: String,
}

/// Compute handle.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComputeHandle {
    pub id: ResourceId,
    pub task_arn: String,
    pub cluster: String,
    pub region: String,
}

/// Compute status.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComputeStatus {
    pub handle: ComputeHandle,
    pub state: String,
    pub cpu_utilization: f32,
    pub memory_utilization: f32,
}

/// Compute provider trait.
#[async_trait]
pub trait ComputeProvider: Send + Sync {
    async fn schedule(&self, spec: &ComputeSpec) -> Result<ComputeHandle, ProviderError>;
    async fn terminate(&self, handle: &ComputeHandle) -> Result<(), ProviderError>;
    async fn describe(&self, handle: &ComputeHandle) -> Result<ComputeStatus, ProviderError>;
    async fn health_check(&self) -> Result<(), ProviderError>;
    async fn list_resources(&self) -> Result<Vec<ComputeHandle>, ProviderError>;
}

// ============================================================================
// Identity Provider
// ============================================================================

/// Namespace specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NamespaceSpec {
    pub org_id: ResourceId,
    pub name: String,
}

/// Namespace handle.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Namespace {
    pub id: ResourceId,
    pub org_id: ResourceId,
    pub name: String,
    pub role_arn: String,
}

/// Credential specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialSpec {
    pub namespace_id: ResourceId,
    pub principal: String,
    pub scopes: Vec<String>,
    pub ttl_seconds: u32,
}

/// Token.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Token {
    pub token: String,
    pub expires_at: DateTime<Utc>,
}

/// Identity provider trait.
#[async_trait]
pub trait IdentityProvider: Send + Sync {
    async fn create_namespace(&self, spec: &NamespaceSpec) -> Result<Namespace, ProviderError>;
    async fn issue_credential(&self, spec: &CredentialSpec) -> Result<Token, ProviderError>;
    async fn revoke(&self, token: &Token) -> Result<(), ProviderError>;
    async fn health_check(&self) -> Result<(), ProviderError>;
    async fn list_resources(&self) -> Result<Vec<Namespace>, ProviderError>;
}

// ============================================================================
// Networking Provider
// ============================================================================

/// Endpoint specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EndpointSpec {
    pub name: String,
    pub target: String,
    pub dns_name: String,
    pub region: String,
}

/// Endpoint handle.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Endpoint {
    pub id: ResourceId,
    pub name: String,
    pub dns_name: String,
    pub addresses: Vec<String>,
}

/// Networking provider trait.
#[async_trait]
pub trait NetworkingProvider: Send + Sync {
    async fn register_endpoint(&self, spec: &EndpointSpec) -> Result<Endpoint, ProviderError>;
    async fn deregister(&self, endpoint: &Endpoint) -> Result<(), ProviderError>;
    async fn resolve(&self, name: &str) -> Result<Vec<String>, ProviderError>;
    async fn health_check(&self) -> Result<(), ProviderError>;
    async fn list_resources(&self) -> Result<Vec<Endpoint>, ProviderError>;
}

// ============================================================================
// Secret Provider
// ============================================================================

/// Secret key.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct SecretKey(String);

impl SecretKey {
    pub fn new(key: impl Into<String>) -> Self {
        Self(key.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Secret value.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecretValue {
    pub value: String,
    pub version: String,
}

/// Secret provider trait.
#[async_trait]
pub trait SecretProvider: Send + Sync {
    /// Retrieve current value of a secret.
    async fn get(&self, key: &SecretKey) -> Result<SecretValue, ProviderError>;

    /// Create or update a secret with optional TTL.
    async fn set(
        &self,
        key: &SecretKey,
        value: &SecretValue,
        ttl: Option<std::time::Duration>,
    ) -> Result<(), ProviderError>;

    /// Rotate a secret, returning the new value.
    async fn rotate(&self, key: &SecretKey) -> Result<SecretValue, ProviderError>;

    /// Permanently revoke a secret.
    async fn revoke(&self, key: &SecretKey) -> Result<(), ProviderError>;

    async fn health_check(&self) -> Result<(), ProviderError>;
}

// ============================================================================
// Infrastructure Provider (aggregate)
// ============================================================================

/// Aggregate infrastructure provider.
pub struct InfrastructureProvider {
    pub repository: Arc<dyn RepositoryProvider>,
    pub storage: Arc<dyn StorageProvider>,
    pub compute: Arc<dyn ComputeProvider>,
    pub identity: Arc<dyn IdentityProvider>,
    pub networking: Arc<dyn NetworkingProvider>,
    pub secrets: Arc<dyn SecretProvider>,
}
