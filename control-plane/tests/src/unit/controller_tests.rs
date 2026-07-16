//! Unit tests for controller logic.

use std::sync::Arc;
use async_trait::async_trait;
use models::{
    Controller, Resource, ResourceId, OwnerReference,
    ReconcileContext, ReconcileResult, ErrorPolicy, HealthError,
};

#[cfg(test)]
mod test_controller {
    use super::*;

    /// Test controller for unit testing.
    struct TestController;

    #[async_trait]
    impl Controller for TestController {
        type Resource = TestResource;
        type Error = TestError;

        async fn reconcile(
            &self,
            _resource: Arc<Self::Resource>,
            _ctx: ReconcileContext,
        ) -> Result<ReconcileResult, Self::Error> {
            Ok(ReconcileResult::Ok)
        }

        fn error_policy(
            &self,
            _resource: Arc<Self::Resource>,
            _error: &Self::Error,
            _ctx: ReconcileContext,
        ) -> ErrorPolicy {
            ErrorPolicy::Discard
        }

        async fn health_check(&self) -> Result<(), HealthError> {
            Ok(())
        }
    }

    #[derive(Debug, Clone)]
    struct TestResource {
        id: ResourceId,
        version: u64,
    }

    impl Resource for TestResource {
        fn id(&self) -> &ResourceId {
            &self.id
        }

        fn version(&self) -> u64 {
            self.version
        }

        fn finalizers(&self) -> &[String] {
            &[]
        }

        fn deletion_requested(&self) -> bool {
            false
        }

        fn owner_refs(&self) -> &[OwnerReference] {
            &[]
        }
    }

    #[derive(Debug, thiserror::Error)]
    enum TestError {
        #[error("test error")]
        Test,
    }

    #[tokio::test]
    async fn test_controller_reconcile() {
        let controller = TestController;

        let resource = Arc::new(TestResource {
            id: ResourceId::new("test-id"),
            version: 1,
        });

        let ctx = ReconcileContext::new();

        let result = controller.reconcile(resource, ctx).await;
        assert!(result.is_ok());
    }
}
