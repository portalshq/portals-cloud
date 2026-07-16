//! Common test utilities and fixtures.

use std::sync::Arc;
use reconciler::ControllerMetrics;
use control_plane_mock_provider::{create_mock_provider, MockProviderConfig};

/// Create a test metrics instance.
pub fn create_test_metrics() -> Arc<ControllerMetrics> {
    Arc::new(ControllerMetrics::new("test".to_string()))
}

/// Create a test mock provider.
pub fn create_test_provider() -> control_plane_provider_trait::InfrastructureProvider {
    create_mock_provider(MockProviderConfig::default())
}

/// Create a test mock provider with failure injection.
pub fn create_failing_provider(failure_rate: f64) -> control_plane_provider_trait::InfrastructureProvider {
    let config = MockProviderConfig {
        inject_failures: true,
        failure_rate,
    };
    create_mock_provider(config)
}
