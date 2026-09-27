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
    pub cognito_domain: Option<String>,
    pub cognito_client_id: Option<String>,
    pub cognito_issuer: Option<String>,
    pub cognito_redirect_uri: Option<String>,
    /// Optional generic OIDC provider. When `OIDC_ISSUER` is set, the gateway
    /// uses OIDC discovery against that issuer instead of Cognito-specific
    /// endpoints. This enables Keycloak, ZITADEL, Ory, etc. with the same
    /// PKCE + refresh rotation semantics for local/dev parity.
    pub oidc_issuer: Option<String>,
    pub oidc_client_id: Option<String>,
    pub oidc_domain: Option<String>,
    pub oidc_redirect_uri: Option<String>,
    pub jwt_issuer: String,
    pub jwt_kms_key_id: String,
    pub jwt_local_private_key_path: Option<String>,
    pub jwt_kid: String,
    pub jwt_signing_enabled: bool,
    pub jwt_retired_kms_key_ids: Vec<String>,
    pub jwt_signing_provider: String,
    pub api_key_pepper_secret_arn: String,
    pub api_key_pepper_base64: Option<String>,
    pub api_key_pepper_file_path: Option<String>,
    pub api_key_pepper_provider: String,
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
            cognito_domain: optional("COGNITO_DOMAIN"),
            cognito_client_id: optional("COGNITO_CLIENT_ID"),
            cognito_issuer: optional("COGNITO_ISSUER"),
            cognito_redirect_uri: optional("COGNITO_REDIRECT_URI"),
            oidc_issuer: env::var("OIDC_ISSUER")
                .ok()
                .filter(|v| !v.trim().is_empty()),
            oidc_client_id: env::var("OIDC_CLIENT_ID")
                .ok()
                .filter(|v| !v.trim().is_empty()),
            oidc_domain: env::var("OIDC_DOMAIN")
                .ok()
                .filter(|v| !v.trim().is_empty()),
            oidc_redirect_uri: env::var("OIDC_REDIRECT_URI")
                .ok()
                .filter(|v| !v.trim().is_empty()),
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
            jwt_signing_provider: env::var("JWT_SIGNING_PROVIDER").unwrap_or_else(|_| {
                if env::var("JWT_LOCAL_PRIVATE_KEY_PATH")
                    .ok()
                    .filter(|v| !v.trim().is_empty())
                    .is_some()
                {
                    "sealed-file".into()
                } else {
                    "aws".into()
                }
            }),
            api_key_pepper_secret_arn: value("API_KEY_PEPPER_SECRET_ARN", ""),
            api_key_pepper_base64: env::var("API_KEY_PEPPER_BASE64")
                .ok()
                .filter(|v| !v.trim().is_empty()),
            api_key_pepper_file_path: env::var("API_KEY_PEPPER_FILE_PATH")
                .ok()
                .filter(|v| !v.trim().is_empty()),
            api_key_pepper_provider: env::var("API_KEY_PEPPER_PROVIDER").unwrap_or_else(|_| {
                if env::var("API_KEY_PEPPER_BASE64")
                    .ok()
                    .filter(|v| !v.trim().is_empty())
                    .is_some()
                    || env::var("API_KEY_PEPPER_FILE_PATH")
                        .ok()
                        .filter(|v| !v.trim().is_empty())
                        .is_some()
                {
                    "sealed-file".into()
                } else {
                    "aws".into()
                }
            }),
            environment: required("LORE_ENV")?,
            internal_admin_token: required("INTERNAL_ADMIN_TOKEN")?,
        };
        config.validate()?;
        Ok(config)
    }

    /// Returns true when a generic OIDC issuer is configured for local/dev.
    pub fn uses_oidc(&self) -> bool {
        self.oidc_issuer.is_some()
    }

    /// Effective issuer for the OIDC/OAuth flow (OIDC overrides Cognito when set).
    pub fn effective_issuer(&self) -> &str {
        self.oidc_issuer
            .as_deref()
            .or(self.cognito_issuer.as_deref())
            .unwrap()
    }

    pub fn effective_client_id(&self) -> &str {
        self.oidc_client_id
            .as_deref()
            .or(self.cognito_client_id.as_deref())
            .unwrap()
    }

    pub fn effective_domain(&self) -> &str {
        self.oidc_domain
            .as_deref()
            .or(self.cognito_domain.as_deref())
            .unwrap()
    }

    pub fn effective_redirect_uri(&self) -> &str {
        self.oidc_redirect_uri
            .as_deref()
            .or(self.cognito_redirect_uri.as_deref())
            .unwrap()
    }

    fn validate(&self) -> anyhow::Result<()> {
        ensure!(
            self.public_base_url.starts_with("https://"),
            "PUBLIC_BASE_URL must use HTTPS"
        );
        ensure!(
            self.cognito_domain
                .as_ref()
                .map_or(true, |v| v.starts_with("https://")),
            "COGNITO_DOMAIN must use HTTPS"
        );
        ensure!(
            self.cognito_issuer
                .as_ref()
                .map_or(true, |v| v.starts_with("https://")),
            "COGNITO_ISSUER must use HTTPS"
        );
        ensure!(
            self.cognito_redirect_uri
                .as_ref()
                .map_or(true, |v| v.starts_with("https://")),
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
            matches!(self.jwt_signing_provider.as_str(), "aws" | "sealed-file"),
            "JWT_SIGNING_PROVIDER must be aws or sealed-file"
        );
        ensure!(
            matches!(self.api_key_pepper_provider.as_str(), "aws" | "sealed-file"),
            "API_KEY_PEPPER_PROVIDER must be aws or sealed-file"
        );
        ensure!(
            self.oidc_issuer.is_some() || self.cognito_issuer.is_some(),
            "OIDC_ISSUER or COGNITO_ISSUER is required"
        );
        ensure!(
            self.oidc_client_id.is_some() || self.cognito_client_id.is_some(),
            "OIDC_CLIENT_ID or COGNITO_CLIENT_ID is required"
        );
        ensure!(
            self.oidc_redirect_uri.is_some() || self.cognito_redirect_uri.is_some(),
            "OIDC_REDIRECT_URI or COGNITO_REDIRECT_URI is required"
        );
        ensure!(
            !self.jwt_kms_key_id.is_empty() || self.jwt_local_private_key_path.is_some(),
            "JWT_KMS_KEY_ID or JWT_LOCAL_PRIVATE_KEY_PATH is required"
        );
        if self.environment == "prod" {
            if self.jwt_signing_provider == "aws" {
                ensure!(
                    self.jwt_local_private_key_path.is_none(),
                    "AWS signing cannot use a filesystem key"
                );
                ensure!(
                    !self.jwt_kms_key_id.is_empty(),
                    "AWS signing requires JWT_KMS_KEY_ID"
                );
            } else {
                ensure!(
                    self.jwt_local_private_key_path.is_some(),
                    "sealed-file signing requires JWT_LOCAL_PRIVATE_KEY_PATH"
                );
            }
            if self.api_key_pepper_provider == "aws" {
                ensure!(
                    self.api_key_pepper_base64.is_none()
                        && self.api_key_pepper_file_path.is_none()
                        && !self.api_key_pepper_secret_arn.is_empty(),
                    "AWS pepper requires Secrets Manager"
                );
            } else {
                ensure!(
                    self.api_key_pepper_base64.is_some() || self.api_key_pepper_file_path.is_some(),
                    "sealed-file pepper requires API_KEY_PEPPER_FILE_PATH or API_KEY_PEPPER_BASE64"
                );
            }
        }
        ensure!(
            !self.api_key_pepper_secret_arn.is_empty() || self.api_key_pepper_base64.is_some() || self.api_key_pepper_file_path.is_some(),
            "API_KEY_PEPPER_SECRET_ARN, API_KEY_PEPPER_FILE_PATH, or API_KEY_PEPPER_BASE64 is required"
        );
        ensure!(
            self.internal_admin_token.len() >= 32,
            "INTERNAL_ADMIN_TOKEN must contain at least 32 bytes"
        );
        if let Some(issuer) = &self.oidc_issuer {
            ensure!(issuer.starts_with("https://"), "OIDC_ISSUER must use HTTPS");
        }
        if let Some(domain) = &self.oidc_domain {
            ensure!(domain.starts_with("https://"), "OIDC_DOMAIN must use HTTPS");
        }
        Ok(())
    }
}

fn required(name: &str) -> anyhow::Result<String> {
    env::var(name).with_context(|| format!("{name} is required"))
}

fn optional(name: &str) -> Option<String> {
    env::var(name).ok().filter(|v| !v.trim().is_empty())
}

fn value(name: &str, default: &str) -> String {
    env::var(name).unwrap_or_else(|_| default.to_string())
}
