//! Unit tests for configuration loading.

use clap::Parser;
use config::AppConfig;

#[cfg(test)]
mod test_config {
    use super::*;

    #[test]
    fn test_config_defaults() {
        let config = AppConfig::parse_from(&["test"]);

        assert_eq!(config.listen_addr.port(), 8083);
        assert_eq!(config.log_filter, "info,lorecloud_control_plane=debug,sqlx=warn");
    }

    #[test]
    fn test_config_from_env() {
        std::env::set_var("LISTEN_ADDR", "0.0.0.0:9090");
        std::env::set_var("RUST_LOG", "debug");

        let config = AppConfig::parse_from(&["test"]);

        assert_eq!(config.listen_addr.port(), 9090);
        assert_eq!(config.log_filter, "debug");

        std::env::remove_var("LISTEN_ADDR");
        std::env::remove_var("RUST_LOG");
    }
}
