//! AWS provider implementations — production provider using aws-sdk-rust.
//!
//! All AWS provider implementations are wrapped with CircuitBreakerProvider
//! for fault tolerance and to prevent cascading failures.

use std::sync::Arc;
use aws_config::Region;
use aws_config::BehaviorVersion;
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
use reconciler::ControllerMetrics;

mod repository;
mod storage;
mod compute;
mod identity;
mod networking;
mod secret;
mod circuit_breaker;

pub use repository::AwsRepositoryProvider;
pub use storage::AwsStorageProvider;
pub use compute::AwsComputeProvider;
pub use identity::AwsIdentityProvider;
pub use networking::AwsNetworkingProvider;
pub use secret::AwsSecretProvider;
pub use circuit_breaker::CircuitBreakerConfig;

/// Create AWS infrastructure provider with circuit breakers.
pub async fn create_aws_provider(
    region: Region,
    metrics: Arc<ControllerMetrics>,
    circuit_config: CircuitBreakerConfig,
) -> Result<InfrastructureProvider, ProviderError> {
    let config = aws_config::defaults(BehaviorVersion::latest())
        .region(region)
        .load()
        .await
        .map_err(|e| ProviderError::Unavailable(e.to_string()))?;

    // Create base providers
    let repository = Arc::new(AwsRepositoryProvider::new(config.clone())) as Arc<dyn RepositoryProvider>;
    let storage = Arc::new(AwsStorageProvider::new(config.clone())) as Arc<dyn StorageProvider>;
    let compute = Arc::new(AwsComputeProvider::new(config.clone())) as Arc<dyn ComputeProvider>;
    let identity = Arc::new(AwsIdentityProvider::new(config.clone())) as Arc<dyn IdentityProvider>;
    let networking = Arc::new(AwsNetworkingProvider::new(config.clone())) as Arc<dyn NetworkingProvider>;
    let secrets = Arc::new(AwsSecretProvider::new(config)) as Arc<dyn SecretProvider>;

    // Wrap with circuit breakers
    let repository = circuit_breaker::wrap_repository(repository, metrics.clone(), circuit_config.clone());
    let storage = circuit_breaker::wrap_storage(storage, metrics.clone(), circuit_config.clone());
    let compute = circuit_breaker::wrap_compute(compute, metrics.clone(), circuit_config.clone());
    let identity = circuit_breaker::wrap_identity(identity, metrics.clone(), circuit_config.clone());
    let networking = circuit_breaker::wrap_networking(networking, metrics.clone(), circuit_config.clone());
    let secrets = circuit_breaker::wrap_secret(secrets, metrics, circuit_config);

    Ok(InfrastructureProvider {
        repository,
        storage,
        compute,
        identity,
        networking,
        secrets,
    })
}
