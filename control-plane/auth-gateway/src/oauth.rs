use crate::{
    config::GatewayConfig,
    store::{AuthSession, SecurityStore},
};
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
    email: String,
    #[serde(default)]
    name: String,
    #[serde(rename = "cognito:username", default)]
    cognito_username: String,
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

    pub async fn start(&self, client_state: Uuid) -> anyhow::Result<(AuthSession, String)> {
        let mut verifier_bytes = [0_u8; 32];
        OsRng.fill_bytes(&mut verifier_bytes);
        let verifier = URL_SAFE_NO_PAD.encode(verifier_bytes);
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        let session = self.store.start_session(client_state, verifier).await?;
        // OIDC discovery path (Keycloak, ZITADEL, etc.) when OIDC_ISSUER is set.
        if let Some(discovery) = self.discovery().await? {
            let login_url = format!(
                "{}?response_type=code&client_id={}&redirect_uri={}&scope=openid%20email%20profile&state={}&nonce={}&code_challenge={}&code_challenge_method=S256",
                discovery.authorization_endpoint,
                urlencoding::encode(self.config.effective_client_id()),
                urlencoding::encode(&self.config.cognito_redirect_uri),
                session.oauth_state,
                session.oidc_nonce,
                urlencoding::encode(&challenge),
            );
            return Ok((session, login_url));
        }
        let login_url = format!(
            "{}/oauth2/authorize?response_type=code&client_id={}&redirect_uri={}&scope=openid%20email%20profile&state={}&nonce={}&code_challenge={}&code_challenge_method=S256",
            self.config.cognito_domain.trim_end_matches('/'),
            urlencoding::encode(&self.config.cognito_client_id),
            urlencoding::encode(&self.config.cognito_redirect_uri),
            session.oauth_state,
            session.oidc_nonce,
            urlencoding::encode(&challenge),
        );
        Ok((session, login_url))
    }

    pub async fn complete(&self, oauth_state: Uuid, code: &str) -> anyhow::Result<()> {
        let session = self.store.session_for_callback(oauth_state).await?;
        // Choose token endpoint via discovery when OIDC is configured.
        let token_endpoint = if let Some(discovery) = self.discovery().await? {
            discovery.token_endpoint
        } else {
            format!(
                "{}/oauth2/token",
                self.config.cognito_domain.trim_end_matches('/')
            )
        };
        let response = self
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
                ("redirect_uri", self.config.cognito_redirect_uri.as_str()),
                ("code_verifier", session.pkce_verifier.as_str()),
            ])
            .send()
            .await?
            .error_for_status()?
            .json::<TokenResponse>()
            .await?;
        let claims = self.verify_id_token(&response.id_token).await?;
        anyhow::ensure!(
            claims.nonce == session.oidc_nonce.to_string(),
            "OIDC nonce mismatch"
        );
        // Cognito includes token_use=id; generic OIDC providers omit it.
        if !claims.token_use.is_empty() {
            anyhow::ensure!(claims.token_use == "id", "OIDC token_use is not id");
        }
        let username = if !claims.email.is_empty() {
            claims.email.as_str()
        } else if !claims.cognito_username.is_empty() {
            claims.cognito_username.as_str()
        } else if !claims.preferred_username.is_empty() {
            claims.preferred_username.as_str()
        } else {
            &claims.sub
        };
        let name = if !claims.name.is_empty() {
            claims.name.as_str()
        } else {
            username
        };
        self.store
            .complete_session(oauth_state, &claims.sub, name, username)
            .await
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
                self.config.cognito_issuer.trim_end_matches('/')
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
