use ed25519_dalek::{SigningKey, VerifyingKey};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

pub mod middleware;
pub mod idempotency;

#[derive(Clone)]
pub struct DataPlaneSigningKey {
    signing_key: SigningKey,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DataPlaneClaims {
    pub sub: String,
    pub repo_id: String,
    pub permissions: Vec<String>,
    pub iat: u64,
    pub exp: u64,
}

impl DataPlaneSigningKey {
    pub fn from_env(key_str: &str) -> anyhow::Result<Self> {
        let key_bytes = base64::Engine::decode(
            &base64::engine::general_purpose::STANDARD,
            key_str.trim(),
        )
        .map_err(|e| anyhow::anyhow!("invalid base64 key: {e}"))?;

        if key_bytes.len() == 32 {
            let bytes: [u8; 32] = key_bytes
                .as_slice()
                .try_into()
                .map_err(|_| anyhow::anyhow!("key length mismatch"))?;
            let signing_key = SigningKey::from_bytes(&bytes);
            Ok(Self { signing_key })
        } else {
            Err(anyhow::anyhow!(
                "key must be 32 bytes, got {}",
                key_bytes.len()
            ))
        }
    }

    pub fn generate() -> (SigningKey, String) {
        let mut bytes = [0u8; 32];
        rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut bytes);
        let signing_key = SigningKey::from_bytes(&bytes);
        let encoded = base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            signing_key.to_bytes(),
        );
        (signing_key, encoded)
    }

    pub fn issue_data_plane_token(
        &self,
        subject: &str,
        repo_id: &str,
        permissions: Vec<String>,
        expiry_secs: u64,
    ) -> Result<String, TokenError> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| TokenError::InvalidToken(format!("system time error: {e}")))?
            .as_secs();

        let claims = DataPlaneClaims {
            sub: subject.to_string(),
            repo_id: repo_id.to_string(),
            permissions,
            iat: now,
            exp: now + expiry_secs,
        };

        let encoding_key = EncodingKey::from_secret(self.signing_key.to_bytes().as_slice());
        encode(
            &Header::new(jsonwebtoken::Algorithm::EdDSA),
            &claims,
            &encoding_key,
        )
        .map_err(|e| TokenError::Signing(e.to_string()))
    }

    pub fn verify_data_plane_token(&self, token: &str) -> Result<DataPlaneClaims, TokenError> {
        let vk = self.signing_key.verifying_key();
        let decoding_key = DecodingKey::from_secret(vk.as_ref());
        let mut validation = Validation::new(jsonwebtoken::Algorithm::EdDSA);
        validation.validate_exp = true;

        decode::<DataPlaneClaims>(token, &decoding_key, &validation)
            .map(|data| data.claims)
            .map_err(|e| TokenError::Verification(e.to_string()))
    }

    pub fn verifying_key(&self) -> VerifyingKey {
        self.signing_key.verifying_key()
    }
}

#[derive(Debug, thiserror::Error)]
pub enum TokenError {
    #[error("Signing error: {0}")]
    Signing(String),
    #[error("Verification error: {0}")]
    Verification(String),
}
