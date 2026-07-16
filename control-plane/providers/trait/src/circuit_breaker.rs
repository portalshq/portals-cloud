//! Circuit breaker wrapper for provider calls.

use std::sync::Arc;
use std::time::{Duration, Instant};
use async_trait::async_trait;
use tokio::sync::Mutex;
use super::{
    RepositoryProvider, RepositoryHandle, RepositorySpec, RepositoryStatus, RepositorySpecPatch,
    ProviderError,
};

/// Circuit breaker state.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CircuitState {
    Closed,
    Open,
    HalfOpen,
}

/// Circuit breaker configuration.
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

/// Circuit breaker state machine.
pub struct CircuitBreaker {
    config: CircuitBreakerConfig,
    state: CircuitState,
    failures: Vec<Instant>,
    half_open_calls: u32,
    opened_at: Option<Instant>,
}

impl CircuitBreaker {
    pub fn new(config: CircuitBreakerConfig) -> Self {
        Self {
            config,
            state: CircuitState::Closed,
            failures: Vec::new(),
            half_open_calls: 0,
            opened_at: None,
        }
    }

    pub fn state(&self) -> CircuitState {
        self.state
    }

    pub fn retry_after(&self) -> Duration {
        if let Some(opened_at) = self.opened_at {
            let elapsed = opened_at.elapsed();
            if elapsed < self.config.open_duration {
                self.config.open_duration - elapsed
            } else {
                Duration::ZERO
            }
        } else {
            Duration::ZERO
        }
    }

    pub fn record<T, E>(&mut self, result: &Result<T, E>) {
        let is_failure = result.is_err();
        let now = Instant::now();

        // Clean old failures outside sample window
        self.failures.retain(|&t| now.duration_since(t) < self.config.sample_window);

        match self.state {
            CircuitState::Closed => {
                if is_failure {
                    self.failures.push(now);
                    let failure_rate = self.failures.len() as f64 / self.config.sample_window.as_secs_f64();
                    if failure_rate >= self.config.failure_threshold {
                        self.state = CircuitState::Open;
                        self.opened_at = Some(now);
                    }
                }
            }
            CircuitState::Open => {
                // Check if we should transition to half-open
                if let Some(opened_at) = self.opened_at {
                    if now.duration_since(opened_at) >= self.config.open_duration {
                        self.state = CircuitState::HalfOpen;
                        self.half_open_calls = 0;
                    }
                }
            }
            CircuitState::HalfOpen => {
                self.half_open_calls += 1;
                if is_failure {
                    self.state = CircuitState::Open;
                    self.opened_at = Some(now);
                } else if self.half_open_calls >= self.config.half_open_max_calls {
                    self.state = CircuitState::Closed;
                    self.failures.clear();
                }
            }
        }
    }
}

/// Circuit breaker wrapper for RepositoryProvider.
pub struct CircuitBreakerRepositoryProvider<P> {
    inner: P,
    breaker: Arc<Mutex<CircuitBreaker>>,
    provider_name: String,
}

impl<P> CircuitBreakerRepositoryProvider<P> {
    pub fn new(inner: P, breaker: Arc<Mutex<CircuitBreaker>>, provider_name: String) -> Self {
        Self {
            inner,
            breaker,
            provider_name,
        }
    }
}

#[async_trait]
impl<P: RepositoryProvider> RepositoryProvider for CircuitBreakerRepositoryProvider<P> {
    async fn provision(&self, spec: &RepositorySpec) -> Result<RepositoryHandle, ProviderError> {
        let state = {
            let breaker = self.breaker.lock().await;
            breaker.state()
        };
        
        match state {
            CircuitState::Open => {
                return Err(ProviderError::CircuitOpen {
                    provider: self.provider_name.clone(),
                    retry_after: {
                        let breaker = self.breaker.lock().await;
                        breaker.retry_after()
                    },
                });
            }
            _ => {}
        }

        let result = self.inner.provision(spec).await;
        {
            let mut breaker = self.breaker.lock().await;
            breaker.record(&result);
        }
        result
    }

    async fn deprovision(&self, handle: &RepositoryHandle) -> Result<(), ProviderError> {
        let state = {
            let breaker = self.breaker.lock().await;
            breaker.state()
        };
        
        match state {
            CircuitState::Open => {
                return Err(ProviderError::CircuitOpen {
                    provider: self.provider_name.clone(),
                    retry_after: {
                        let breaker = self.breaker.lock().await;
                        breaker.retry_after()
                    },
                });
            }
            _ => {}
        }
        let result = self.inner.deprovision(handle).await;
        {
            let mut breaker = self.breaker.lock().await;
            breaker.record(&result);
        }
        result
    }

    async fn describe(&self, handle: &RepositoryHandle) -> Result<RepositoryStatus, ProviderError> {
        let state = {
            let breaker = self.breaker.lock().await;
            breaker.state()
        };
        
        match state {
            CircuitState::Open => {
                return Err(ProviderError::CircuitOpen {
                    provider: self.provider_name.clone(),
                    retry_after: {
                        let breaker = self.breaker.lock().await;
                        breaker.retry_after()
                    },
                });
            }
            _ => {}
        }
        let result = self.inner.describe(handle).await;
        {
            let mut breaker = self.breaker.lock().await;
            breaker.record(&result);
        }
        result
    }

    async fn update(&self, handle: &RepositoryHandle, patch: &RepositorySpecPatch) -> Result<(), ProviderError> {
        let state = {
            let breaker = self.breaker.lock().await;
            breaker.state()
        };
        
        match state {
            CircuitState::Open => {
                return Err(ProviderError::CircuitOpen {
                    provider: self.provider_name.clone(),
                    retry_after: {
                        let breaker = self.breaker.lock().await;
                        breaker.retry_after()
                    },
                });
            }
            _ => {}
        }
        let result = self.inner.update(handle, patch).await;
        {
            let mut breaker = self.breaker.lock().await;
            breaker.record(&result);
        }
        result
    }

    async fn health_check(&self) -> Result<(), ProviderError> {
        self.inner.health_check().await
    }

    async fn list_resources(&self) -> Result<Vec<RepositoryHandle>, ProviderError> {
        self.inner.list_resources().await
    }
}
