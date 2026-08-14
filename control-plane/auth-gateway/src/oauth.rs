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
    nonce: String,
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

impl CognitoOauth {
    pub fn new(config: GatewayConfig, store: SecurityStore) -> Self {
        Self {
            config,
            store,
            client: reqwest::Client::new(),
        }
    }

    pub async fn start(&self, client_state: Uuid) -> anyhow::Result<(AuthSession, String)> {
        let mut verifier_bytes = [0_u8; 32];
        OsRng.fill_bytes(&mut verifier_bytes);
        let verifier = URL_SAFE_NO_PAD.encode(verifier_bytes);
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        let session = self.store.start_session(client_state, verifier).await?;
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
        let response = self
            .client
            .post(format!(
                "{}/oauth2/token",
                self.config.cognito_domain.trim_end_matches('/')
            ))
            .header(
                reqwest::header::CONTENT_TYPE,
                "application/x-www-form-urlencoded",
            )
            .form(&[
                ("grant_type", "authorization_code"),
                ("client_id", self.config.cognito_client_id.as_str()),
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
        anyhow::ensure!(claims.token_use == "id", "Cognito token_use is not id");
        let username = if claims.email.is_empty() {
            &claims.cognito_username
        } else {
            &claims.email
        };
        let name = if claims.name.is_empty() {
            username
        } else {
            &claims.name
        };
        self.store
            .complete_session(oauth_state, &claims.sub, name, username)
            .await
    }

    async fn verify_id_token(&self, token: &str) -> anyhow::Result<CognitoClaims> {
        let header = decode_header(token)?;
        anyhow::ensure!(
            header.alg == Algorithm::RS256,
            "Cognito ID token must use RS256"
        );
        let kid = header
            .kid
            .ok_or_else(|| anyhow::anyhow!("Cognito ID token has no kid"))?;
        let jwks = self
            .client
            .get(format!(
                "{}/.well-known/jwks.json",
                self.config.cognito_issuer.trim_end_matches('/')
            ))
            .send()
            .await?
            .error_for_status()?
            .json::<CognitoJwks>()
            .await?;
        let jwk = jwks
            .keys
            .into_iter()
            .find(|key| key.kid == kid)
            .ok_or_else(|| anyhow::anyhow!("Cognito ID token kid is unknown"))?;
        anyhow::ensure!(
            jwk.alg == "RS256" && jwk.kty == "RSA",
            "Cognito JWK algorithm or type is invalid"
        );
        let key = DecodingKey::from_rsa_components(&jwk.n, &jwk.e)?;
        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_issuer(&[self.config.cognito_issuer.as_str()]);
        validation.set_audience(&[self.config.cognito_client_id.as_str()]);
        validation.validate_exp = true;
        Ok(decode::<CognitoClaims>(token, &key, &validation)?.claims)
    }
}
