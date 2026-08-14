pub mod repository;
pub mod secret;

use std::time::Duration;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ProviderError {
    #[error("Circuit open: {provider}")]
    CircuitOpen {
        provider: String,
        retry_after: Duration,
    },
    #[error("API error: {0}")]
    ApiError(String),
    #[error("Not found")]
    NotFound,
}
