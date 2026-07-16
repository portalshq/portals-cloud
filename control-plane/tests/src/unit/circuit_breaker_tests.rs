//! Unit tests for circuit breaker logic.

use std::time::Duration;
use control_plane_provider_trait::circuit_breaker::{CircuitBreaker, CircuitBreakerConfig, CircuitBreakerState};

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

        assert_eq!(breaker.state(), CircuitBreakerState::Closed);
    }

    #[test]
    fn test_circuit_breaker_open_on_threshold() {
        let config = CircuitBreakerConfig {
            failure_threshold: 0.5,
            sample_window: Duration::from_secs(60),
            open_duration: Duration::from_secs(30),
            half_open_max_calls: 5,
        };
        let breaker = CircuitBreaker::new(config);

        // Record failures
        for _ in 0..10 {
            breaker.record_failure();
        }

        // Should open after threshold
        assert_eq!(breaker.state(), CircuitBreakerState::Open);
    }

    #[test]
    fn test_circuit_breaker_half_open_after_duration() {
        let config = CircuitBreakerConfig {
            failure_threshold: 0.5,
            sample_window: Duration::from_secs(60),
            open_duration: Duration::from_millis(100),
            half_open_max_calls: 5,
        };
        let breaker = CircuitBreaker::new(config);

        // Open the circuit
        for _ in 0..10 {
            breaker.record_failure();
        }

        assert_eq!(breaker.state(), CircuitBreakerState::Open);

        // Wait for open duration
        std::thread::sleep(Duration::from_millis(150));

        // Should transition to half-open
        breaker.check_state_transition();
        assert_eq!(breaker.state(), CircuitBreakerState::HalfOpen);
    }
}
