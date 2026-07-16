//! Unit tests for configuration loading.

use config::Config;

#[cfg(test)]
mod test_config {
    use super::*;

    #[test]
    fn test_config_defaults() {
        let config = Config::default();

        assert_eq!(config.server.port, 8080);
        assert_eq!(config.log.level, "info");
    }

    #[test]
    fn test_config_from_env() {
        std::env::set_var("CONTROL_PLANE_PORT", "9090");
        std::env::set_var("CONTROL_PLANE_LOG_LEVEL", "debug");

        let config = Config::load().unwrap();

        assert_eq!(config.server.port, 9090);
        assert_eq!(config.log.level, "debug");

        std::env::remove_var("CONTROL_PLANE_PORT");
        std::env::remove_var("CONTROL_PLANE_LOG_LEVEL");
    }
}
