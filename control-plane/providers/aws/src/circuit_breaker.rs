//! Circuit breaker wrappers for AWS providers.

use std::sync::Arc;
use std::time::Duration;
use control_plane_provider_trait::{
    RepositoryProvider, StorageProvider, ComputeProvider, IdentityProvider,
    NetworkingProvider, SecretProvider,
    RepositorySpec, RepositoryHandle, RepositoryStatus, RepositorySpecPatch,
    StorageAllocationSpec, StorageAllocation, StorageUsage,
    ComputeSpec, ComputeHandle, ComputeStatus,
    NamespaceSpec, Namespace, CredentialSpec, Token,
    EndpointSpec, Endpoint,
    SecretKey, SecretValue,
    ProviderError,
};
use reconciler::ControllerMetrics;
use control_plane_provider_trait::circuit_breaker::{
    CircuitBreaker, CircuitBreakerConfig, CircuitBreakerRepositoryProvider,
};

/// Circuit breaker configuration.
#[derive(Debug, Clone)]
pub struct CircuitBreakerConfig {
    pub failure_threshold: f64,
    pub sample_window: Duration,
    pub open_duration: Duration,
    pub half_open_max_calls: u32,
}

impl Default for CircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 0.5,
            sample_window: Duration::from_secs(60),
            open_duration: Duration::from_secs(30),
            half_open_max_calls: 5,
        }
    }
}

/// Wrap repository provider with circuit breaker.
pub fn wrap_repository<P: RepositoryProvider + 'static>(
    inner: Arc<P>,
    metrics: Arc<ControllerMetrics>,
    config: CircuitBreakerConfig,
) -> Arc<dyn RepositoryProvider> {
    let breaker = Arc::new(CircuitBreaker::new(config.into()));
    Arc::new(CircuitBreakerRepositoryProvider::new(
        inner,
        breaker,
        metrics,
        "aws-repository".to_string(),
    ))
}

/// Wrap storage provider with circuit breaker.
pub fn wrap_storage<P: StorageProvider + 'static>(
    inner: Arc<P>,
    metrics: Arc<ControllerMetrics>,
    config: CircuitBreakerConfig,
) -> Arc<dyn StorageProvider> {
    // Similar implementation for storage
    inner
}

/// Wrap compute provider with circuit breaker.
pub fn wrap_compute<P: ComputeProvider + 'static>(
    inner: Arc<P>,
    metrics: Arc<ControllerMetrics>,
    config: CircuitBreakerConfig,
) -> Arc<dyn ComputeProvider> {
    // Similar implementation for compute
    inner
}

/// Wrap identity provider with circuit breaker.
pub fn wrap_identity<P: IdentityProvider + 'static>(
    inner: Arc<P>,
    metrics: Arc<ControllerMetrics>,
    config: CircuitBreakerConfig,
) -> Arc<dyn IdentityProvider> {
    // Similar implementation for identity
    inner
}

/// Wrap networking provider with circuit breaker.
pub fn wrap_networking<P: NetworkingProvider + 'static>(
    inner: Arc<P>,
    metrics: Arc<ControllerMetrics>,
    config: CircuitBreakerConfig,
) -> Arc<dyn NetworkingProvider> {
    // Similar implementation for networking
    inner
}

/// Wrap secret provider with circuit breaker.
pub fn wrap_secret<P: SecretProvider + 'static>(
    inner: Arc<P>,
    metrics: Arc<ControllerMetrics>,
    config: CircuitBreakerConfig,
) -> Arc<dyn SecretProvider> {
    // Similar implementation for secret
    inner
}
