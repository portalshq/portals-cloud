use anyhow::{ensure, Context};
use std::{env, net::SocketAddr};

#[derive(Debug, Clone)]
pub struct GatewayConfig {
    pub database_url: String,
    pub grpc_addr: SocketAddr,
    pub http_addr: SocketAddr,
    pub internal_addr: SocketAddr,
    pub rebac_addr: SocketAddr,
    pub public_base_url: String,
    pub cognito_domain: String,
    pub cognito_client_id: String,
    pub cognito_issuer: String,
    pub cognito_redirect_uri: String,
    pub jwt_issuer: String,
    pub jwt_kms_key_id: String,
    pub jwt_local_private_key_path: Option<String>,
    pub jwt_kid: String,
    pub jwt_signing_enabled: bool,
    pub jwt_retired_kms_key_ids: Vec<String>,
    pub api_key_pepper_secret_arn: String,
    pub api_key_pepper_base64: Option<String>,
    pub environment: String,
    pub internal_admin_token: String,
}

impl GatewayConfig {
    pub fn from_env() -> anyhow::Result<Self> {
        let config = Self {
            database_url: required("DATABASE_URL")?,
            grpc_addr: value("GRPC_LISTEN_ADDR", "0.0.0.0:8084").parse()?,
            http_addr: value("HTTP_LISTEN_ADDR", "0.0.0.0:8085").parse()?,
            internal_addr: value("INTERNAL_LISTEN_ADDR", "0.0.0.0:8086").parse()?,
            rebac_addr: value("REBAC_LISTEN_ADDR", "0.0.0.0:8087").parse()?,
            public_base_url: required("PUBLIC_BASE_URL")?,
            cognito_domain: required("COGNITO_DOMAIN")?,
            cognito_client_id: required("COGNITO_CLIENT_ID")?,
            cognito_issuer: required("COGNITO_ISSUER")?,
            cognito_redirect_uri: required("COGNITO_REDIRECT_URI")?,
            jwt_issuer: required("JWT_ISSUER")?,
            jwt_kms_key_id: value("JWT_KMS_KEY_ID", ""),
            jwt_local_private_key_path: env::var("JWT_LOCAL_PRIVATE_KEY_PATH")
                .ok()
                .filter(|v| !v.trim().is_empty()),
            jwt_kid: required("JWT_KID")?,
            jwt_signing_enabled: value("JWT_SIGNING_ENABLED", "false")
                .parse()
                .context("JWT_SIGNING_ENABLED must be true or false")?,
            jwt_retired_kms_key_ids: value("JWT_RETIRED_KMS_KEY_IDS", "")
                .split(',')
                .filter(|v| !v.trim().is_empty())
                .map(|v| v.trim().to_string())
                .collect(),
            api_key_pepper_secret_arn: value("API_KEY_PEPPER_SECRET_ARN", ""),
            api_key_pepper_base64: env::var("API_KEY_PEPPER_BASE64")
                .ok()
                .filter(|v| !v.trim().is_empty()),
            environment: required("LORE_ENV")?,
            internal_admin_token: required("INTERNAL_ADMIN_TOKEN")?,
        };
        config.validate()?;
        Ok(config)
    }

    fn validate(&self) -> anyhow::Result<()> {
        ensure!(
            self.public_base_url.starts_with("https://"),
            "PUBLIC_BASE_URL must use HTTPS"
        );
        ensure!(
            self.cognito_domain.starts_with("https://"),
            "COGNITO_DOMAIN must use HTTPS"
        );
        ensure!(
            self.cognito_issuer.starts_with("https://"),
            "COGNITO_ISSUER must use HTTPS"
        );
        ensure!(
            self.cognito_redirect_uri.starts_with("https://"),
            "COGNITO_REDIRECT_URI must use HTTPS"
        );
        ensure!(
            self.jwt_issuer.starts_with("https://"),
            "JWT_ISSUER must use HTTPS"
        );
        ensure!(
            !self.environment.trim().is_empty(),
            "LORE_ENV must not be empty"
        );
        ensure!(
            !self.jwt_kms_key_id.is_empty() || self.jwt_local_private_key_path.is_some(),
            "JWT_KMS_KEY_ID or JWT_LOCAL_PRIVATE_KEY_PATH is required"
        );
        if self.environment == "prod" {
            ensure!(
                self.jwt_local_private_key_path.is_none(),
                "production cannot use a filesystem JWT signing key"
            );
            ensure!(
                !self.jwt_kms_key_id.is_empty(),
                "production requires KMS JWT signing"
            );
            ensure!(
                self.api_key_pepper_base64.is_none() && !self.api_key_pepper_secret_arn.is_empty(),
                "production requires a Secrets Manager API-key pepper"
            );
        }
        ensure!(
            !self.api_key_pepper_secret_arn.is_empty() || self.api_key_pepper_base64.is_some(),
            "API_KEY_PEPPER_SECRET_ARN or API_KEY_PEPPER_BASE64 is required"
        );
        ensure!(
            self.internal_admin_token.len() >= 32,
            "INTERNAL_ADMIN_TOKEN must contain at least 32 bytes"
        );
        Ok(())
    }
}

fn required(name: &str) -> anyhow::Result<String> {
    env::var(name).with_context(|| format!("{name} is required"))
}

fn value(name: &str, default: &str) -> String {
    env::var(name).unwrap_or_else(|_| default.to_string())
}
