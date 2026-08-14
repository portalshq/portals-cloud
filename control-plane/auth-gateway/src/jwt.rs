use aws_sdk_kms::{
    primitives::Blob,
    types::{MessageType, SigningAlgorithmSpec},
    Client as KmsClient,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::{Duration, Utc};
use jsonwebtoken::{
    decode, decode_header, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation,
};
use rsa::{
    pkcs8::{DecodePrivateKey, DecodePublicKey},
    traits::PublicKeyParts,
    RsaPrivateKey, RsaPublicKey,
};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Arc};

const AUTHENTICATION_LIFETIME_HOURS: i64 = 8;
const AUTHORIZATION_LIFETIME_MINUTES: i64 = 5;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ResourcePermission {
    pub resource_id: String,
    pub permission: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub iss: String,
    pub iat: i64,
    pub exp: i64,
    pub aud: Vec<String>,
    pub env: String,
    pub name: String,
    pub preferred_username: String,
    pub is_service_account: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resources: Option<Vec<ResourcePermission>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub groups: Option<Vec<String>>,
    pub idp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Jwk {
    pub kty: String,
    pub alg: String,
    #[serde(rename = "use")]
    pub use_: String,
    pub kid: String,
    pub n: String,
    pub e: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Jwks {
    pub keys: Vec<Jwk>,
}

#[derive(Clone)]
pub struct KmsJwtSigner {
    backend: SignerBackend,
    key_id: String,
    kid: String,
    issuer: String,
    environment: String,
    decoding_keys: Arc<HashMap<String, DecodingKey>>,
    jwks: Jwks,
}

#[derive(Clone)]
enum SignerBackend {
    Kms(KmsClient),
    Local(EncodingKey),
}

impl KmsJwtSigner {
    pub async fn load_with_retired(
        kms: KmsClient,
        key_id: String,
        kid: String,
        retired_key_ids: Vec<String>,
        issuer: String,
        environment: String,
    ) -> anyhow::Result<Self> {
        let mut decoding_keys = HashMap::new();
        let mut keys = Vec::new();
        for (kms_id, published_kid) in std::iter::once((key_id.clone(), kid.clone()))
            .chain(retired_key_ids.into_iter().map(|id| (id.clone(), id)))
        {
            let response = kms.get_public_key().key_id(&kms_id).send().await?;
            let der = response
                .public_key()
                .ok_or_else(|| anyhow::anyhow!("KMS signing key has no public key"))?;
            let public_key = RsaPublicKey::from_public_key_der(der.as_ref())?;
            let n = URL_SAFE_NO_PAD.encode(public_key.n().to_bytes_be());
            let e = URL_SAFE_NO_PAD.encode(public_key.e().to_bytes_be());
            decoding_keys.insert(
                published_kid.clone(),
                DecodingKey::from_rsa_components(&n, &e)?,
            );
            keys.push(Jwk {
                kty: "RSA".into(),
                alg: "RS256".into(),
                use_: "sig".into(),
                kid: published_kid,
                n,
                e,
            });
        }
        Ok(Self {
            backend: SignerBackend::Kms(kms),
            key_id,
            kid,
            issuer,
            environment,
            decoding_keys: Arc::new(decoding_keys),
            jwks: Jwks { keys },
        })
    }

    pub fn load_local(
        private_pem: &[u8],
        kid: String,
        issuer: String,
        environment: String,
    ) -> anyhow::Result<Self> {
        anyhow::ensure!(
            environment != "prod",
            "local JWT keys are forbidden in production"
        );
        let pem = std::str::from_utf8(private_pem)?;
        let private = RsaPrivateKey::from_pkcs8_pem(pem)?;
        let public = RsaPublicKey::from(&private);
        let n = URL_SAFE_NO_PAD.encode(public.n().to_bytes_be());
        let e = URL_SAFE_NO_PAD.encode(public.e().to_bytes_be());
        let mut decoding_keys = HashMap::new();
        decoding_keys.insert(kid.clone(), DecodingKey::from_rsa_components(&n, &e)?);
        let jwks = Jwks {
            keys: vec![Jwk {
                kty: "RSA".into(),
                alg: "RS256".into(),
                use_: "sig".into(),
                kid: kid.clone(),
                n,
                e,
            }],
        };
        Ok(Self {
            backend: SignerBackend::Local(EncodingKey::from_rsa_pem(private_pem)?),
            key_id: String::new(),
            kid,
            issuer,
            environment,
            decoding_keys: Arc::new(decoding_keys),
            jwks,
        })
    }

    pub fn jwks(&self) -> &Jwks {
        &self.jwks
    }

    pub async fn authentication_token(
        &self,
        subject: &str,
        name: &str,
        preferred_username: &str,
        service_account: bool,
        idp: &str,
    ) -> anyhow::Result<(String, i64)> {
        self.issue(
            subject,
            name,
            preferred_username,
            service_account,
            idp,
            None,
            Duration::hours(AUTHENTICATION_LIFETIME_HOURS),
        )
        .await
    }

    pub async fn authorization_token(
        &self,
        identity: &Claims,
        resource: ResourcePermission,
    ) -> anyhow::Result<(String, i64)> {
        self.issue(
            &identity.sub,
            &identity.name,
            &identity.preferred_username,
            identity.is_service_account,
            &identity.idp,
            Some(vec![resource]),
            Duration::minutes(AUTHORIZATION_LIFETIME_MINUTES),
        )
        .await
    }

    async fn issue(
        &self,
        subject: &str,
        name: &str,
        preferred_username: &str,
        service_account: bool,
        idp: &str,
        resources: Option<Vec<ResourcePermission>>,
        lifetime: Duration,
    ) -> anyhow::Result<(String, i64)> {
        let now = Utc::now();
        let exp = (now + lifetime).timestamp();
        let claims = Claims {
            sub: subject.into(),
            iss: self.issuer.clone(),
            iat: now.timestamp(),
            exp,
            aud: vec!["lore".into(), "portals.sh".into()],
            env: self.environment.clone(),
            name: name.into(),
            preferred_username: preferred_username.into(),
            is_service_account: service_account,
            resources,
            groups: None,
            idp: idp.into(),
        };
        if let SignerBackend::Local(key) = &self.backend {
            let mut header = Header::new(Algorithm::RS256);
            header.kid = Some(self.kid.clone());
            return Ok((encode(&header, &claims, key)?, exp));
        }
        let header = serde_json::json!({"alg":"RS256","kid":self.kid,"typ":"JWT"});
        let signing_input = format!(
            "{}.{}",
            URL_SAFE_NO_PAD.encode(serde_json::to_vec(&header)?),
            URL_SAFE_NO_PAD.encode(serde_json::to_vec(&claims)?),
        );
        let SignerBackend::Kms(kms) = &self.backend else {
            unreachable!("local signer returned above")
        };
        let result = kms
            .sign()
            .key_id(&self.key_id)
            .message(Blob::new(signing_input.as_bytes()))
            .message_type(MessageType::Raw)
            .signing_algorithm(SigningAlgorithmSpec::RsassaPkcs1V15Sha256)
            .send()
            .await?;
        let signature = result
            .signature()
            .ok_or_else(|| anyhow::anyhow!("KMS returned no signature"))?;
        Ok((
            format!(
                "{signing_input}.{}",
                URL_SAFE_NO_PAD.encode(signature.as_ref())
            ),
            exp,
        ))
    }

    pub fn verify_authentication(&self, token: &str) -> anyhow::Result<Claims> {
        let claims = self.verify(token)?;
        anyhow::ensure!(
            claims.resources.is_none(),
            "authorization token cannot be exchanged as authentication"
        );
        Ok(claims)
    }

    pub fn verify_authorization(&self, token: &str, resource_id: &str) -> anyhow::Result<Claims> {
        let claims = self.verify(token)?;
        let resources = claims
            .resources
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("authentication token is not repository-scoped"))?;
        anyhow::ensure!(
            resources.len() == 1
                && resources[0].resource_id == resource_id
                && !resource_id.contains('*'),
            "token is not authorized for this repository"
        );
        Ok(claims)
    }

    fn verify(&self, token: &str) -> anyhow::Result<Claims> {
        let header = decode_header(token)?;
        anyhow::ensure!(header.alg == Algorithm::RS256, "only RS256 is accepted");
        let token_kid = header
            .kid
            .ok_or_else(|| anyhow::anyhow!("JWT kid is required"))?;
        let decoding_key = self
            .decoding_keys
            .get(&token_kid)
            .ok_or_else(|| anyhow::anyhow!("unknown JWT kid"))?;
        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_issuer(&[self.issuer.as_str()]);
        validation.set_audience(&["lore", "portals.sh"]);
        validation.validate_exp = true;
        let claims = decode::<Claims>(token, decoding_key, &validation)?.claims;
        anyhow::ensure!(claims.env == self.environment, "JWT environment mismatch");
        anyhow::ensure!(
            claims.aud.iter().any(|a| a == "lore") && claims.aud.iter().any(|a| a == "portals.sh"),
            "mandatory JWT audience missing"
        );
        Ok(claims)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rsa::pkcs8::{EncodePrivateKey, LineEnding};

    fn local_signer(environment: &str) -> KmsJwtSigner {
        let key = RsaPrivateKey::new(&mut rand::thread_rng(), 2048).unwrap();
        let pem = key.to_pkcs8_pem(LineEnding::LF).unwrap();
        KmsJwtSigner::load_local(
            pem.as_bytes(),
            "test-kid".into(),
            "https://auth.portals.sh".into(),
            environment.into(),
        )
        .unwrap()
    }

    #[test]
    fn authorization_contract_is_single_exact_resource() {
        let permission = ResourcePermission {
            resource_id: "urc-0123456789abcdef0123456789abcdef".into(),
            permission: vec!["read".into(), "write".into()],
        };
        assert_eq!(permission.resource_id.len(), 36);
        assert!(!permission.resource_id.contains('*'));
    }

    #[tokio::test]
    async fn local_rs256_tokens_enforce_kind_environment_and_resource() {
        let signer = local_signer("dev");
        let (authn, _) = signer
            .authentication_token("user-1", "User", "user@example.com", false, "test")
            .await
            .unwrap();
        let identity = signer.verify_authentication(&authn).unwrap();
        let resource = ResourcePermission {
            resource_id: "urc-0123456789abcdef0123456789abcdef".into(),
            permission: vec!["read".into(), "write".into()],
        };
        let (authz, _) = signer
            .authorization_token(&identity, resource.clone())
            .await
            .unwrap();
        assert!(signer.verify_authentication(&authz).is_err());
        assert!(signer
            .verify_authorization(&authz, &resource.resource_id)
            .is_ok());
        assert!(signer
            .verify_authorization(&authz, "urc-ffffffffffffffffffffffffffffffff")
            .is_err());
        let same_key = RsaPrivateKey::new(&mut rand::thread_rng(), 2048).unwrap();
        let same_pem = same_key.to_pkcs8_pem(LineEnding::LF).unwrap();
        let dev = KmsJwtSigner::load_local(
            same_pem.as_bytes(),
            "same-kid".into(),
            "https://auth.portals.sh".into(),
            "dev".into(),
        )
        .unwrap();
        let wrong_environment = KmsJwtSigner::load_local(
            same_pem.as_bytes(),
            "same-kid".into(),
            "https://auth.portals.sh".into(),
            "staging".into(),
        )
        .unwrap();
        let (authn, _) = dev
            .authentication_token("user-1", "User", "user@example.com", false, "test")
            .await
            .unwrap();
        assert!(wrong_environment.verify_authentication(&authn).is_err());
    }

    #[test]
    fn production_rejects_local_signing_keys() {
        let key = RsaPrivateKey::new(&mut rand::thread_rng(), 2048).unwrap();
        let pem = key.to_pkcs8_pem(LineEnding::LF).unwrap();
        assert!(KmsJwtSigner::load_local(
            pem.as_bytes(),
            "kid".into(),
            "https://auth.portals.sh".into(),
            "prod".into()
        )
        .is_err());
    }
}
