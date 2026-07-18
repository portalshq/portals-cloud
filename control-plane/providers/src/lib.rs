pub mod r#trait;
pub mod mock;
pub mod aws;

// Re-exports for public API
pub use r#trait::repository::{RepositorySpec, RepositoryHandle, RepositoryStatus, RepositoryProvider};
