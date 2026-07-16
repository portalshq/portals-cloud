//! End-to-end tests — full system tests with real infrastructure.

#[cfg(feature = "e2e")]
pub mod repository_lifecycle;
pub mod infrastructure_lifecycle;
