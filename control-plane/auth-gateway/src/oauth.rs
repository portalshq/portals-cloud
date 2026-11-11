use crate::{
    config::GatewayConfig,
    store::{AuthSession, SecurityStore},
};
use anyhow::Context;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};
use rand::{rngs::OsRng, RngCore};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use uuid::Uuid;

#[derive(Clone)]
pub struct CognitoOauth {
    config: GatewayConfig,
    store: SecurityStore,
    client: reqwest::Client,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    id_token: String,
}

#[derive(Debug, Deserialize)]
struct CognitoClaims {
    sub: String,
    #[serde(default)]
    preferred_username: String,
    nonce: String,
    #[serde(default)]
    token_use: String,
}

#[derive(Debug, Deserialize)]
struct CognitoJwks {
    keys: Vec<CognitoJwk>,
}

#[derive(Debug, Deserialize)]
struct CognitoJwk {
    kid: String,
    n: String,
    e: String,
    alg: String,
    kty: String,
}

#[derive(Debug, Deserialize)]
struct OidcDiscovery {
    issuer: String,
    authorization_endpoint: String,
    token_endpoint: String,
    jwks_uri: String,
}

impl CognitoOauth {
    pub fn new(config: GatewayConfig, store: SecurityStore) -> Self {
        Self {
            config,
            store,
            client: reqwest::Client::new(),
        }
    }

    async fn discovery(&self) -> anyhow::Result<Option<OidcDiscovery>> {
        let Some(issuer) = self.config.oidc_issuer.as_deref() else {
            return Ok(None);
        };
        let url = format!(
            "{}/.well-known/openid-configuration",
            issuer.trim_end_matches('/')
        );
        let discovery = self
            .client
            .get(&url)
            .send()
            .await?
            .error_for_status()?
            .json::<OidcDiscovery>()
            .await?;
        // Enforce exact issuer match — prevents issuer confusion attacks.
        anyhow::ensure!(
            discovery.issuer.trim_end_matches('/') == issuer.trim_end_matches('/'),
            "OIDC discovery issuer mismatch"
        );
        Ok(Some(discovery))
    }

    pub async fn start(
        &self,
        client_state: Uuid,
        post_login_redirect_uri: Option<String>,
    ) -> anyhow::Result<(AuthSession, String)> {
        let mut verifier_bytes = [0_u8; 32];
        OsRng.fill_bytes(&mut verifier_bytes);
        let verifier = URL_SAFE_NO_PAD.encode(verifier_bytes);
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        let session = self
            .store
            .start_session(client_state, verifier, post_login_redirect_uri)
            .await?;
        // OIDC discovery path (Keycloak, ZITADEL, etc.) when OIDC_ISSUER is set.
        // prompt=login forces the IdP login form even when an SSO session
        // cookie exists, so the viewer always picks the account they sign in
        // with instead of silently continuing as the previous browser user.
        if let Some(discovery) = self.discovery().await? {
            let login_url = format!(
                "{}?response_type=code&client_id={}&redirect_uri={}&scope=openid%20email%20profile&state={}&nonce={}&code_challenge={}&code_challenge_method=S256&prompt=login",
                discovery.authorization_endpoint,
                urlencoding::encode(self.config.effective_client_id()),
                urlencoding::encode(self.config.effective_redirect_uri()),
                session.oauth_state,
                session.oidc_nonce,
                urlencoding::encode(&challenge),
            );
            return Ok((session, login_url));
        }
        let login_url = format!(
            "{}/oauth2/authorize?response_type=code&client_id={}&redirect_uri={}&scope=openid%20email%20profile&state={}&nonce={}&code_challenge={}&code_challenge_method=S256&prompt=login",
            self.config.effective_domain().trim_end_matches('/'),
            urlencoding::encode(self.config.effective_client_id()),
            urlencoding::encode(self.config.effective_redirect_uri()),
            session.oauth_state,
            session.oidc_nonce,
            urlencoding::encode(&challenge),
        );
        Ok((session, login_url))
    }

    pub async fn complete(&self, oauth_state: Uuid, code: &str) -> anyhow::Result<AuthSession> {
        let session = self.store.session_for_callback(oauth_state).await?;
        // Choose token endpoint via discovery when OIDC is configured.
        let token_endpoint = if let Some(discovery) = self.discovery().await? {
            discovery.token_endpoint
        } else {
            format!(
                "{}/oauth2/token",
                self.config.effective_domain().trim_end_matches('/')
            )
        };
        let token_response = self
            .client
            .post(token_endpoint)
            .header(
                reqwest::header::CONTENT_TYPE,
                "application/x-www-form-urlencoded",
            )
            .form(&[
                ("grant_type", "authorization_code"),
                ("client_id", self.config.effective_client_id()),
                ("code", code),
                ("redirect_uri", self.config.effective_redirect_uri()),
                ("code_verifier", session.pkce_verifier.as_str()),
            ])
            .send()
            .await?;
        let token_status = token_response.status();
        let token_body = token_response.text().await?;
        let response = parse_token_response(token_status, &token_body)?;
        let claims = self.verify_id_token(&response.id_token).await?;
        anyhow::ensure!(
            claims.nonce == session.oidc_nonce.to_string(),
            "OIDC nonce mismatch"
        );
        // Cognito includes token_use=id; generic OIDC providers omit it.
        if !claims.token_use.is_empty() {
            anyhow::ensure!(claims.token_use == "id", "OIDC token_use is not id");
        }
        // The private account username is stored for lookups only; the
        // chat-visible display name is user-chosen via SetUserDisplayName and
        // must never derive from IdP profile data, email, or the login name.
        let username = if !claims.preferred_username.is_empty() {
            claims.preferred_username.as_str()
        } else {
            &claims.sub
        };
        self.store
            .complete_session(oauth_state, &claims.sub, username)
            .await?;
        Ok(session)
    }

    async fn verify_id_token(&self, token: &str) -> anyhow::Result<CognitoClaims> {
        let header = decode_header(token)?;
        anyhow::ensure!(
            header.alg == Algorithm::RS256,
            "OIDC ID token must use RS256"
        );
        let kid = header
            .kid
            .ok_or_else(|| anyhow::anyhow!("OIDC ID token has no kid"))?;
        // Fetch JWKS: discovery's jwks_uri for OIDC, otherwise Cognito issuer.
        let jwks_uri = if let Some(discovery) = self.discovery().await? {
            discovery.jwks_uri
        } else {
            format!(
                "{}/.well-known/jwks.json",
                self.config.effective_issuer().trim_end_matches('/')
            )
        };
        let jwks = self
            .client
            .get(jwks_uri)
            .send()
            .await?
            .error_for_status()?
            .json::<CognitoJwks>()
            .await?;
        let jwk = jwks
            .keys
            .into_iter()
            .find(|key| key.kid == kid)
            .ok_or_else(|| anyhow::anyhow!("OIDC ID token kid is unknown"))?;
        anyhow::ensure!(
            jwk.alg == "RS256" && jwk.kty == "RSA",
            "OIDC JWK algorithm or type is invalid"
        );
        let key = DecodingKey::from_rsa_components(&jwk.n, &jwk.e)?;
        let mut validation = Validation::new(Algorithm::RS256);
        let issuer = self.config.effective_issuer();
        let client_id = self.config.effective_client_id();
        validation.set_issuer(&[issuer]);
        validation.set_audience(&[client_id]);
        validation.validate_exp = true;
        Ok(decode::<CognitoClaims>(token, &key, &validation)?.claims)
    }
}

// Surfaces the provider's error body (e.g. `invalid_client: empty client
// secret`) instead of only the HTTP status, so provider misconfiguration is
// diagnosable from gateway logs. On 2xx parse failures the body is withheld:
// a successful response contains tokens.
fn parse_token_response(status: reqwest::StatusCode, body: &str) -> anyhow::Result<TokenResponse> {
    anyhow::ensure!(
        status.is_success(),
        "token endpoint returned {status}: {body}"
    );
    serde_json::from_str::<TokenResponse>(body)
        .context("token endpoint response was not valid JSON")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_error_body_is_surfaced() {
        let error = parse_token_response(
            reqwest::StatusCode::BAD_REQUEST,
            r#"{"error":"invalid_client","error_description":"empty client secret"}"#,
        )
        .unwrap_err()
        .to_string();
        assert!(error.contains("400 Bad Request"), "status missing: {error}");
        assert!(
            error.contains("invalid_client"),
            "error code missing: {error}"
        );
        assert!(
            error.contains("empty client secret"),
            "provider description missing: {error}"
        );
    }

    #[test]
    fn token_success_body_parses() {
        let response =
            parse_token_response(reqwest::StatusCode::OK, r#"{"id_token":"jwt"}"#).unwrap();
        assert_eq!(response.id_token, "jwt");
    }

    #[test]
    fn token_invalid_json_does_not_leak_body() {
        let error = parse_token_response(
            reqwest::StatusCode::OK,
            r#"{"id_token":"jwt","access_token":"secret-token"}trailing"#,
        )
        .unwrap_err()
        .to_string();
        assert!(error.contains("not valid JSON"), "wrong error: {error}");
        assert!(!error.contains("secret-token"), "token leaked: {error}");
    }
}
