//! Service-account API-key primitives.
//!
//! Only the public key id is indexed. The 32-byte secret is authenticated with
//! HMAC-SHA256 and a versioned Secrets Manager pepper; plaintext secrets are
//! returned once at creation and are never stored.

use base64::Engine;
use chrono::{DateTime, Duration, Utc};
use hmac::{Hmac, Mac};
use rand::{rngs::OsRng, RngCore};
use sha2::Sha256;
use uuid::Uuid;

type HmacSha256 = Hmac<Sha256>;
const MIN_PEPPER_BYTES: usize = 32;
const MAX_LIFETIME_DAYS: i64 = 90;

#[derive(Debug, Clone)]
pub struct StoredApiKey {
    pub key_id: Uuid,
    pub secret_hmac: [u8; 32],
    pub expires_at: DateTime<Utc>,
    pub revoked_at: Option<DateTime<Utc>>,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ApiKeyError {
    #[error("malformed API key")]
    Malformed,
    #[error("API key is expired or revoked")]
    Inactive,
    #[error("API key authentication failed")]
    AuthenticationFailed,
    #[error("API-key lifetime must be positive and no greater than 90 days")]
    InvalidLifetime,
    #[error("API-key pepper must contain at least 32 bytes")]
    PepperTooShort,
}

pub fn generate(
    pepper: &[u8],
    expires_at: DateTime<Utc>,
) -> Result<(String, StoredApiKey), ApiKeyError> {
    generate_at(pepper, Utc::now(), expires_at)
}

fn generate_at(
    pepper: &[u8],
    now: DateTime<Utc>,
    expires_at: DateTime<Utc>,
) -> Result<(String, StoredApiKey), ApiKeyError> {
    validate_pepper(pepper)?;
    if expires_at <= now || expires_at > now + Duration::days(MAX_LIFETIME_DAYS) {
        return Err(ApiKeyError::InvalidLifetime);
    }
    let key_id = Uuid::new_v4();
    let mut secret = [0_u8; 32];
    OsRng.fill_bytes(&mut secret);
    let secret_text = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(secret);
    let secret_hmac = digest(pepper, key_id, &secret);
    Ok((
        format!("lore_sk_{key_id}.{secret_text}"),
        StoredApiKey {
            key_id,
            secret_hmac,
            expires_at,
            revoked_at: None,
        },
    ))
}

pub fn verify(
    candidate: &str,
    stored: &StoredApiKey,
    pepper: &[u8],
    now: DateTime<Utc>,
) -> Result<(), ApiKeyError> {
    validate_pepper(pepper)?;
    if stored.revoked_at.is_some() || now >= stored.expires_at {
        return Err(ApiKeyError::Inactive);
    }
    let (prefix, secret_text) = candidate.split_once('.').ok_or(ApiKeyError::Malformed)?;
    let key_id = prefix
        .strip_prefix("lore_sk_")
        .ok_or(ApiKeyError::Malformed)?
        .parse::<Uuid>()
        .map_err(|_| ApiKeyError::Malformed)?;
    if key_id != stored.key_id {
        return Err(ApiKeyError::AuthenticationFailed);
    }
    let secret = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(secret_text)
        .map_err(|_| ApiKeyError::Malformed)?;
    if secret.len() != 32 {
        return Err(ApiKeyError::Malformed);
    }
    let mut mac = HmacSha256::new_from_slice(pepper).expect("HMAC accepts any pepper length");
    mac.update(key_id.as_bytes());
    mac.update(&secret);
    mac.verify_slice(&stored.secret_hmac)
        .map_err(|_| ApiKeyError::AuthenticationFailed)
}

fn validate_pepper(pepper: &[u8]) -> Result<(), ApiKeyError> {
    if pepper.len() < MIN_PEPPER_BYTES {
        return Err(ApiKeyError::PepperTooShort);
    }
    Ok(())
}

fn digest(pepper: &[u8], key_id: Uuid, secret: &[u8]) -> [u8; 32] {
    let mut mac = HmacSha256::new_from_slice(pepper).expect("HMAC accepts any pepper length");
    mac.update(key_id.as_bytes());
    mac.update(secret);
    mac.finalize().into_bytes().into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    #[test]
    fn verifies_correct_secret_and_rejects_tampering() {
        let now = Utc::now();
        let pepper = [7_u8; 32];
        let (key, stored) = generate_at(&pepper, now, now + Duration::days(30)).unwrap();
        assert_eq!(verify(&key, &stored, &pepper, now), Ok(()));
        let mut tampered = key.clone();
        let replacement = if tampered.ends_with('A') { "B" } else { "A" };
        tampered.replace_range(tampered.len() - 1.., replacement);
        assert_eq!(
            verify(&tampered, &stored, &pepper, now),
            Err(ApiKeyError::AuthenticationFailed),
        );
    }

    #[test]
    fn rejects_revoked_and_expired_keys() {
        let now = Utc::now();
        let pepper = [9_u8; 32];
        let (key, mut stored) = generate_at(&pepper, now, now + Duration::minutes(1)).unwrap();
        stored.revoked_at = Some(now);
        assert_eq!(
            verify(&key, &stored, &pepper, now),
            Err(ApiKeyError::Inactive)
        );
        stored.revoked_at = None;
        assert_eq!(
            verify(&key, &stored, &pepper, now + Duration::minutes(2)),
            Err(ApiKeyError::Inactive),
        );
    }

    #[test]
    fn rejects_short_peppers_and_invalid_lifetimes() {
        let now = Utc::now();
        assert!(matches!(
            generate_at(b"short", now, now + Duration::days(1)),
            Err(ApiKeyError::PepperTooShort),
        ));
        let pepper = [1_u8; 32];
        assert!(matches!(
            generate_at(&pepper, now, now + Duration::days(91)),
            Err(ApiKeyError::InvalidLifetime),
        ));
        assert!(matches!(
            generate_at(&pepper, now, now),
            Err(ApiKeyError::InvalidLifetime),
        ));
    }
}
