pub mod repository;
pub mod organization;

pub use models::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resource_kind_display() {
        assert_eq!(ResourceKind::Repository.to_string(), "Repository");
        assert_eq!(ResourceKind::Organization.to_string(), "Organization");
    }

    #[test]
    fn resource_id_as_str() {
        let id = ResourceId::new("repo-123");
        assert_eq!(id.as_str(), "repo-123");
    }
}
