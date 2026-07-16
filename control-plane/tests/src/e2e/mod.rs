//! End-to-end tests — full system tests with real infrastructure.

#[cfg(feature = "e2e")]
pub mod repository_lifecycle;

#[cfg(feature = "e2e")]
pub mod infrastructure_lifecycle;
