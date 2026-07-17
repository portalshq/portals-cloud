//! Unit tests for circuit breaker logic.

use std::time::Duration;
use control_plane_provider_trait::circuit_breaker::{CircuitBreaker, CircuitBreakerConfig, CircuitState};
use tokio::sync::Mutex;
use std::sync::Arc;

#[cfg(test)]
mod test_circuit_breaker {
    use super::*;

    #[test]
    fn test_circuit_breaker_initial_state() {
        let config = CircuitBreakerConfig {
            failure_threshold: 0.5,
            sample_window: Duration::from_secs(60),
            open_duration: Duration::from_secs(30),
            half_open_max_calls: 5,
        };
        let breaker = CircuitBreaker::new(config);

        assert_eq!(breaker.state(), CircuitState::Closed);
    }

    #[test]
    fn test_circuit_breaker_open_on_threshold() {
        let config = CircuitBreakerConfig {
            failure_threshold: 0.5,
            sample_window: Duration::from_secs(1),
            open_duration: Duration::from_secs(30),
            half_open_max_calls: 5,
        };
        let mut breaker = CircuitBreaker::new(config);

        // Record failures - need at least 1 to hit 0.5 threshold with 1s window
        for _ in 0..1 {
            breaker.record(&Result::<(), ()>::Err(()));
        }

        // Should open after threshold
        assert_eq!(breaker.state(), CircuitState::Open);
    }

    #[tokio::test]
    async fn test_circuit_breaker_half_open_after_duration() {
        let config = CircuitBreakerConfig {
            failure_threshold: 0.5,
            sample_window: Duration::from_secs(1),
            open_duration: Duration::from_millis(100),
            half_open_max_calls: 5,
        };
        let breaker = Arc::new(Mutex::new(CircuitBreaker::new(config)));

        // Open the circuit
        {
            let mut b = breaker.lock().await;
            for _ in 0..1 {
                b.record(&Result::<(), ()>::Err(()));
            }
        }

        {
            let b = breaker.lock().await;
            assert_eq!(b.state(), CircuitState::Open);
        }

        // Wait for open duration
        tokio::time::sleep(Duration::from_millis(150)).await;

        // Record a call to trigger state transition
        {
            let mut b = breaker.lock().await;
            b.record(&Result::<(), ()>::Ok(()));
        }

        // Should transition to half-open
        let b = breaker.lock().await;
        assert_eq!(b.state(), CircuitState::HalfOpen);
    }
}
