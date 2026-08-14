use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::{DateTime, Duration, Timelike, Utc};
use hmac::{Hmac, Mac};
use rand::{rngs::OsRng, RngCore};
use sha2::Sha256;
use sqlx::{PgPool, Row};
use uuid::Uuid;

const API_KEY_ATTEMPTS_PER_MINUTE: i32 = 30;
type HmacSha256 = Hmac<Sha256>;

struct StoredApiKey {
    key_id: Uuid,
    secret_hmac: [u8; 32],
    expires_at: DateTime<Utc>,
    revoked_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone)]
pub struct AuthSession {
    pub session_code: Uuid,
    pub client_state: Uuid,
    pub oauth_state: Uuid,
    pub pkce_verifier: String,
    pub oidc_nonce: Uuid,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct CompletedSession {
    pub subject_id: String,
    pub display_name: String,
    pub preferred_username: String,
}

#[derive(Debug, Clone)]
pub struct Principal {
    pub subject_id: String,
    pub display_name: String,
    pub preferred_username: String,
}

#[derive(Clone)]
pub struct SecurityStore {
    pool: PgPool,
}

impl SecurityStore {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn run_migration(&self) -> anyhow::Result<()> {
        sqlx::raw_sql(include_str!(
            "../../persistence/migrations/003_security_authorization.sql"
        ))
        .execute(&self.pool)
        .await?;
        sqlx::raw_sql(include_str!(
            "../../persistence/migrations/004_auth_gateway_runtime.sql"
        ))
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn is_healthy(&self) -> bool {
        sqlx::query_scalar::<_, i32>("SELECT 1")
            .fetch_one(&self.pool)
            .await
            .is_ok()
    }

    pub async fn start_session(
        &self,
        client_state: Uuid,
        pkce_verifier: String,
    ) -> anyhow::Result<AuthSession> {
        let session = AuthSession {
            session_code: Uuid::new_v4(),
            client_state,
            oauth_state: Uuid::new_v4(),
            pkce_verifier,
            oidc_nonce: Uuid::new_v4(),
            expires_at: Utc::now() + Duration::minutes(10),
        };
        sqlx::query("INSERT INTO auth_gateway_sessions (session_code, client_state, oauth_state, pkce_verifier, oidc_nonce, expires_at) VALUES ($1,$2,$3,$4,$5,$6)")
            .bind(session.session_code).bind(session.client_state).bind(session.oauth_state)
            .bind(&session.pkce_verifier).bind(session.oidc_nonce).bind(session.expires_at).execute(&self.pool).await?;
        Ok(session)
    }

    pub async fn session_for_callback(&self, oauth_state: Uuid) -> anyhow::Result<AuthSession> {
        let row = sqlx::query("SELECT session_code, client_state, oauth_state, pkce_verifier, oidc_nonce, expires_at FROM auth_gateway_sessions WHERE oauth_state=$1 AND consumed_at IS NULL AND completed_at IS NULL AND expires_at > NOW()")
            .bind(oauth_state).fetch_optional(&self.pool).await?
            .ok_or_else(|| anyhow::anyhow!("authentication session is invalid or expired"))?;
        Ok(AuthSession {
            session_code: row.get("session_code"),
            client_state: row.get("client_state"),
            oauth_state: row.get("oauth_state"),
            pkce_verifier: row.get("pkce_verifier"),
            oidc_nonce: row.get("oidc_nonce"),
            expires_at: row.get("expires_at"),
        })
    }

    pub async fn complete_session(
        &self,
        oauth_state: Uuid,
        subject: &str,
        name: &str,
        username: &str,
    ) -> anyhow::Result<()> {
        validate_subject(subject)?;
        let mut tx = self.pool.begin().await?;
        let result = sqlx::query("UPDATE auth_gateway_sessions SET subject_id=$1, display_name=$2, preferred_username=$3, completed_at=NOW(), pkce_verifier='' WHERE oauth_state=$4 AND completed_at IS NULL AND consumed_at IS NULL AND expires_at > NOW()")
            .bind(subject).bind(name).bind(username).bind(oauth_state).execute(&mut *tx).await?;
        anyhow::ensure!(
            result.rows_affected() == 1,
            "authentication session was already completed or expired"
        );
        sqlx::query("INSERT INTO auth_principals (subject_type, subject_id, display_name, preferred_username) VALUES ('user',$1,$2,$3) ON CONFLICT (subject_type,subject_id) DO UPDATE SET display_name=EXCLUDED.display_name, preferred_username=EXCLUDED.preferred_username, updated_at=NOW()")
            .bind(subject).bind(name).bind(username).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn consume_session(
        &self,
        client_state: Uuid,
        session_code: Uuid,
    ) -> anyhow::Result<Option<CompletedSession>> {
        let row = sqlx::query("UPDATE auth_gateway_sessions SET consumed_at=NOW() WHERE session_code=$1 AND client_state=$2 AND completed_at IS NOT NULL AND consumed_at IS NULL AND expires_at > NOW() RETURNING subject_id, display_name, preferred_username")
            .bind(session_code).bind(client_state).fetch_optional(&self.pool).await?;
        Ok(row.map(|r| CompletedSession {
            subject_id: r.get("subject_id"),
            display_name: r.get("display_name"),
            preferred_username: r.get("preferred_username"),
        }))
    }

    pub async fn relationship(
        &self,
        subject_type: &str,
        subject_id: &str,
        resource_id: &str,
    ) -> anyhow::Result<Option<String>> {
        validate_subject(subject_id)?;
        validate_resource(resource_id)?;
        let row = sqlx::query("SELECT relation FROM resource_relationships WHERE resource_type='repository' AND resource_id=$1 AND subject_type=$2 AND subject_id=$3 AND relation IN ('owner','collaborator') LIMIT 1")
            .bind(resource_id).bind(subject_type).bind(subject_id).fetch_optional(&self.pool).await?;
        Ok(row.map(|r| r.get("relation")))
    }

    pub async fn principal_active(
        &self,
        subject_type: &str,
        subject_id: &str,
    ) -> anyhow::Result<bool> {
        Ok(sqlx::query("SELECT 1 FROM auth_principals WHERE subject_type=$1 AND subject_id=$2 AND disabled_at IS NULL")
            .bind(subject_type).bind(subject_id).fetch_optional(&self.pool).await?.is_some())
    }

    pub async fn disable_service_account(&self, subject_id: &str) -> anyhow::Result<()> {
        validate_subject(subject_id)?;
        let mut tx = self.pool.begin().await?;
        sqlx::query("UPDATE auth_principals SET disabled_at=NOW(),updated_at=NOW() WHERE subject_type='service_account' AND subject_id=$1")
            .bind(subject_id).execute(&mut *tx).await?;
        sqlx::query("UPDATE service_account_api_keys SET revoked_at=COALESCE(revoked_at,NOW()) WHERE service_account_id=$1")
            .bind(subject_id).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn upsert_repository_owner(
        &self,
        operation_id: Uuid,
        resource_id: &str,
        subject_type: &str,
        subject_id: &str,
        repository_created: bool,
    ) -> anyhow::Result<()> {
        validate_resource(resource_id)?;
        validate_subject(subject_id)?;
        anyhow::ensure!(
            matches!(subject_type, "user" | "service_account"),
            "invalid subject type"
        );
        anyhow::ensure!(
            repository_created,
            "owner relationship cannot precede repository creation"
        );
        let mut tx = self.pool.begin().await?;
        // Repository creation is client-retryable, so serialize bootstrap by
        // resource and allow retries only for an already-established owner.
        // Without this lock/check, two subjects could concurrently claim the
        // same client-selected repository id.
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))")
            .bind(resource_id)
            .execute(&mut *tx)
            .await?;
        let owners = sqlx::query("SELECT subject_type,subject_id FROM resource_relationships WHERE resource_type='repository' AND resource_id=$1 AND relation='owner' FOR UPDATE")
            .bind(resource_id)
            .fetch_all(&mut *tx)
            .await?;
        if !owners.is_empty() {
            let retrying_owner = owners.iter().any(|owner| {
                owner.get::<String, _>("subject_type") == subject_type
                    && owner.get::<String, _>("subject_id") == subject_id
            });
            anyhow::ensure!(
                retrying_owner,
                "repository ownership is already established for another subject"
            );
        }
        sqlx::query("INSERT INTO repository_security_reconciliation (operation_id,repository_id,owner_subject_id,repository_created) VALUES ($1,$2,$3,TRUE) ON CONFLICT (repository_id,owner_subject_id) DO UPDATE SET repository_created=TRUE, attempts=repository_security_reconciliation.attempts+1, updated_at=NOW()")
            .bind(operation_id).bind(resource_id).bind(subject_id).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO resource_relationships (resource_type,resource_id,subject_type,subject_id,relation) VALUES ('repository',$1,$2,$3,'owner') ON CONFLICT (resource_type,resource_id,subject_type,subject_id) DO UPDATE SET relation='owner',updated_at=NOW()")
            .bind(resource_id).bind(subject_type).bind(subject_id).execute(&mut *tx).await?;
        sqlx::query("UPDATE repository_security_reconciliation SET owner_relationship_created=TRUE,last_error=NULL,updated_at=NOW() WHERE repository_id=$1 AND owner_subject_id=$2")
            .bind(resource_id).bind(subject_id).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn request_repository_deletion(
        &self,
        resource_id: &str,
        subject_type: &str,
        subject_id: &str,
    ) -> anyhow::Result<()> {
        anyhow::ensure!(
            self.relationship(subject_type, subject_id, resource_id)
                .await?
                .as_deref()
                == Some("owner"),
            "only an owner may delete a repository"
        );
        sqlx::query("INSERT INTO repository_deletion_reconciliation (repository_id,requested_by) VALUES ($1,$2) ON CONFLICT (repository_id) DO UPDATE SET requested_by=EXCLUDED.requested_by,requested_at=NOW(),confirmed_at=NULL,last_error=NULL")
            .bind(resource_id).bind(subject_id).execute(&self.pool).await?;
        Ok(())
    }

    pub async fn confirm_repository_deletion(
        &self,
        resource_id: &str,
        subject_type: &str,
        subject_id: &str,
    ) -> anyhow::Result<()> {
        validate_resource(resource_id)?;
        validate_subject(subject_id)?;
        let mut tx = self.pool.begin().await?;
        let request = sqlx::query("SELECT requested_by,confirmed_at FROM repository_deletion_reconciliation WHERE repository_id=$1 FOR UPDATE")
            .bind(resource_id).fetch_optional(&mut *tx).await?
            .ok_or_else(|| anyhow::anyhow!("repository deletion was not authorized"))?;
        let requested_by: String = request.get("requested_by");
        anyhow::ensure!(requested_by == subject_id, "deletion principal mismatch");
        let confirmed_at: Option<DateTime<Utc>> = request.get("confirmed_at");
        if confirmed_at.is_some() {
            tx.commit().await?;
            return Ok(());
        }
        let owner = sqlx::query("SELECT 1 FROM resource_relationships WHERE resource_type='repository' AND resource_id=$1 AND subject_type=$2 AND subject_id=$3 AND relation='owner'")
            .bind(resource_id).bind(subject_type).bind(subject_id)
            .fetch_optional(&mut *tx).await?.is_some();
        anyhow::ensure!(owner, "only an owner may confirm repository deletion");
        sqlx::query("DELETE FROM resource_relationships WHERE resource_type='repository' AND resource_id=$1")
            .bind(resource_id).execute(&mut *tx).await?;
        sqlx::query("UPDATE repository_deletion_reconciliation SET confirmed_at=NOW(),last_error=NULL WHERE repository_id=$1")
            .bind(resource_id).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn upsert_relationship_as_owner(
        &self,
        resource_id: &str,
        actor_subject_type: &str,
        actor_subject_id: &str,
        subject_type: &str,
        subject_id: &str,
        relation: &str,
    ) -> anyhow::Result<()> {
        validate_resource(resource_id)?;
        anyhow::ensure!(
            matches!(actor_subject_type, "user" | "service_account")
                && matches!(subject_type, "user" | "service_account"),
            "invalid subject type"
        );
        validate_subject(actor_subject_id)?;
        validate_subject(subject_id)?;
        anyhow::ensure!(
            matches!(relation, "owner" | "collaborator"),
            "invalid relationship"
        );
        let mut tx = self.pool.begin().await?;
        let actor_is_owner = sqlx::query("SELECT 1 FROM resource_relationships WHERE resource_type='repository' AND resource_id=$1 AND subject_type=$2 AND subject_id=$3 AND relation='owner' FOR UPDATE")
            .bind(resource_id).bind(actor_subject_type).bind(actor_subject_id)
            .fetch_optional(&mut *tx).await?.is_some();
        anyhow::ensure!(actor_is_owner, "only an owner may manage sharing");
        let target_is_active = sqlx::query("SELECT 1 FROM auth_principals WHERE subject_type=$1 AND subject_id=$2 AND disabled_at IS NULL")
            .bind(subject_type).bind(subject_id).fetch_optional(&mut *tx).await?.is_some();
        anyhow::ensure!(
            target_is_active,
            "sharing target does not exist or is disabled"
        );
        if relation != "owner" {
            let owners = sqlx::query("SELECT subject_type,subject_id FROM resource_relationships WHERE resource_type='repository' AND resource_id=$1 AND relation='owner' FOR UPDATE")
                .bind(resource_id).fetch_all(&mut *tx).await?;
            let target_is_owner = owners.iter().any(|row| {
                row.get::<String, _>("subject_type") == subject_type
                    && row.get::<String, _>("subject_id") == subject_id
            });
            anyhow::ensure!(
                !target_is_owner || owners.len() > 1,
                "the final repository owner cannot be downgraded"
            );
        }
        sqlx::query("INSERT INTO resource_relationships (resource_type,resource_id,subject_type,subject_id,relation) VALUES ('repository',$1,$2,$3,$4) ON CONFLICT (resource_type,resource_id,subject_type,subject_id) DO UPDATE SET relation=EXCLUDED.relation,updated_at=NOW()")
            .bind(resource_id).bind(subject_type).bind(subject_id).bind(relation).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn remove_relationship_as_owner(
        &self,
        resource_id: &str,
        actor_subject_type: &str,
        actor_subject_id: &str,
        subject_type: &str,
        subject_id: &str,
    ) -> anyhow::Result<()> {
        validate_resource(resource_id)?;
        anyhow::ensure!(
            matches!(actor_subject_type, "user" | "service_account")
                && matches!(subject_type, "user" | "service_account"),
            "invalid subject type"
        );
        validate_subject(actor_subject_id)?;
        validate_subject(subject_id)?;
        let mut tx = self.pool.begin().await?;
        let owners = sqlx::query("SELECT subject_type,subject_id FROM resource_relationships WHERE resource_type='repository' AND resource_id=$1 AND relation='owner' FOR UPDATE")
            .bind(resource_id).fetch_all(&mut *tx).await?;
        anyhow::ensure!(
            owners.iter().any(
                |row| row.get::<String, _>("subject_type") == actor_subject_type
                    && row.get::<String, _>("subject_id") == actor_subject_id
            ),
            "only an owner may manage sharing"
        );
        let removing_owner = owners.iter().any(|row| {
            row.get::<String, _>("subject_type") == subject_type
                && row.get::<String, _>("subject_id") == subject_id
        });
        anyhow::ensure!(
            !removing_owner || owners.len() > 1,
            "the final repository owner cannot be removed"
        );
        sqlx::query("DELETE FROM resource_relationships WHERE resource_type='repository' AND resource_id=$1 AND subject_type=$2 AND subject_id=$3")
            .bind(resource_id).bind(subject_type).bind(subject_id).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn issue_api_key(
        &self,
        pepper: &[u8],
        pepper_version: &str,
        service_account_id: &str,
        display_name: &str,
        lifetime_days: i64,
        rotation_family: Option<Uuid>,
    ) -> anyhow::Result<String> {
        validate_subject(service_account_id)?;
        let expires_at = Utc::now() + Duration::days(lifetime_days);
        anyhow::ensure!(pepper.len() >= 32, "API-key pepper is too short");
        anyhow::ensure!(
            lifetime_days > 0 && lifetime_days <= 90,
            "API-key lifetime must be 1-90 days"
        );
        let (plaintext, stored) = generate_api_key(pepper, expires_at)?;
        let family = rotation_family.unwrap_or_else(Uuid::new_v4);
        let mut tx = self.pool.begin().await?;
        sqlx::query("INSERT INTO service_account_api_keys (key_id,service_account_id,secret_hmac,pepper_version,expires_at,rotation_family) VALUES ($1,$2,$3,$4,$5,$6)")
            .bind(stored.key_id).bind(service_account_id).bind(stored.secret_hmac.as_slice())
            .bind(pepper_version).bind(stored.expires_at).bind(family).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO auth_principals (subject_type,subject_id,display_name,preferred_username) VALUES ('service_account',$1,$2,$1) ON CONFLICT (subject_type,subject_id) DO UPDATE SET display_name=EXCLUDED.display_name,updated_at=NOW()")
            .bind(service_account_id).bind(display_name).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(plaintext)
    }

    pub async fn rotate_api_key(
        &self,
        pepper: &[u8],
        pepper_version: &str,
        old_key_id: Uuid,
        lifetime_days: i64,
    ) -> anyhow::Result<String> {
        anyhow::ensure!(
            pepper.len() >= 32 && lifetime_days > 0 && lifetime_days <= 90,
            "invalid API-key rotation settings"
        );
        let mut tx = self.pool.begin().await?;
        let row = sqlx::query("SELECT service_account_id,rotation_family FROM service_account_api_keys WHERE key_id=$1 AND revoked_at IS NULL AND rotated_at IS NULL AND expires_at > NOW() FOR UPDATE")
            .bind(old_key_id).fetch_optional(&mut *tx).await?.ok_or_else(|| anyhow::anyhow!("API key is inactive or already rotated"))?;
        let service_account_id: String = row.get("service_account_id");
        let family: Uuid = row.get("rotation_family");
        let (plaintext, stored) =
            generate_api_key(pepper, Utc::now() + Duration::days(lifetime_days))?;
        sqlx::query("INSERT INTO service_account_api_keys (key_id,service_account_id,secret_hmac,pepper_version,expires_at,rotation_family) VALUES ($1,$2,$3,$4,$5,$6)")
            .bind(stored.key_id).bind(&service_account_id).bind(stored.secret_hmac.as_slice()).bind(pepper_version).bind(stored.expires_at).bind(family).execute(&mut *tx).await?;
        sqlx::query("UPDATE service_account_api_keys SET rotated_at=NOW(),overlap_until=NOW()+INTERVAL '24 hours' WHERE key_id=$1 AND rotated_at IS NULL")
            .bind(old_key_id).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(plaintext)
    }

    pub async fn revoke_api_key(&self, key_id: Uuid) -> anyhow::Result<()> {
        sqlx::query("UPDATE service_account_api_keys SET revoked_at=NOW() WHERE key_id=$1 AND revoked_at IS NULL")
            .bind(key_id).execute(&self.pool).await?;
        Ok(())
    }

    pub async fn authenticate_api_key(
        &self,
        candidate: &str,
        pepper: &[u8],
    ) -> anyhow::Result<Principal> {
        let key_id = public_key_id(candidate)?;
        let row = sqlx::query("SELECT k.secret_hmac,k.expires_at,k.revoked_at,k.rotated_at,k.overlap_until,k.service_account_id,p.display_name,p.preferred_username FROM service_account_api_keys k JOIN auth_principals p ON p.subject_type='service_account' AND p.subject_id=k.service_account_id AND p.disabled_at IS NULL WHERE k.key_id=$1")
            .bind(key_id).fetch_optional(&self.pool).await?.ok_or_else(|| anyhow::anyhow!("API key authentication failed"))?;
        // Rate-limit only identifiers that actually exist. Otherwise an attacker
        // can fill the rate-limit table with arbitrary UUIDs; unknown-key floods
        // are handled by the public WAF's per-IP rule.
        self.enforce_api_key_rate_limit(key_id).await?;
        let digest: Vec<u8> = row.get("secret_hmac");
        anyhow::ensure!(digest.len() == 32, "stored API key digest is corrupt");
        let mut secret_hmac = [0_u8; 32];
        secret_hmac.copy_from_slice(&digest);
        let rotated_at: Option<DateTime<Utc>> = row.get("rotated_at");
        let overlap_until: Option<DateTime<Utc>> = row.get("overlap_until");
        let revoked_at: Option<DateTime<Utc>> = row.get("revoked_at");
        let effectively_revoked = revoked_at.or_else(|| {
            rotated_at.and_then(|_| overlap_until.filter(|until| Utc::now() >= *until))
        });
        let stored = StoredApiKey {
            key_id,
            secret_hmac,
            expires_at: row.get("expires_at"),
            revoked_at: effectively_revoked,
        };
        verify_api_key(candidate, &stored, pepper, Utc::now())?;
        sqlx::query("UPDATE service_account_api_keys SET last_used_at=NOW() WHERE key_id=$1")
            .bind(key_id)
            .execute(&self.pool)
            .await?;
        Ok(Principal {
            subject_id: row.get("service_account_id"),
            display_name: row.get("display_name"),
            preferred_username: row.get("preferred_username"),
        })
    }

    async fn enforce_api_key_rate_limit(&self, key_id: Uuid) -> anyhow::Result<()> {
        let now = Utc::now();
        let window = now
            .with_second(0)
            .and_then(|t| t.with_nanosecond(0))
            .expect("valid minute");
        let row = sqlx::query("INSERT INTO api_key_exchange_rate_limits (key_id,window_start,attempts) VALUES ($1,$2,1) ON CONFLICT (key_id,window_start) DO UPDATE SET attempts=api_key_exchange_rate_limits.attempts+1 RETURNING attempts")
            .bind(key_id).bind(window).fetch_one(&self.pool).await?;
        let attempts: i32 = row.get("attempts");
        anyhow::ensure!(
            attempts <= API_KEY_ATTEMPTS_PER_MINUTE,
            "API key exchange rate limit exceeded"
        );
        Ok(())
    }

    pub async fn principal(
        &self,
        subject_type: &str,
        subject_id: &str,
    ) -> anyhow::Result<Option<Principal>> {
        let row = sqlx::query("SELECT subject_type,subject_id,display_name,preferred_username FROM auth_principals WHERE subject_type=$1 AND subject_id=$2")
            .bind(subject_type).bind(subject_id).fetch_optional(&self.pool).await?;
        Ok(row.map(|r| Principal {
            subject_id: r.get("subject_id"),
            display_name: r.get("display_name"),
            preferred_username: r.get("preferred_username"),
        }))
    }

    pub async fn principal_by_username(&self, username: &str) -> anyhow::Result<Option<Principal>> {
        let row = sqlx::query("SELECT subject_type,subject_id,display_name,preferred_username FROM auth_principals WHERE preferred_username=$1 LIMIT 1")
            .bind(username).fetch_optional(&self.pool).await?;
        Ok(row.map(|r| Principal {
            subject_id: r.get("subject_id"),
            display_name: r.get("display_name"),
            preferred_username: r.get("preferred_username"),
        }))
    }

    pub async fn resources_for(
        &self,
        subject_type: &str,
        subject_id: &str,
    ) -> anyhow::Result<Vec<(String, String)>> {
        let rows = sqlx::query("SELECT resource_id,relation FROM resource_relationships WHERE resource_type='repository' AND subject_type=$1 AND subject_id=$2 ORDER BY resource_id")
            .bind(subject_type).bind(subject_id).fetch_all(&self.pool).await?;
        Ok(rows
            .into_iter()
            .map(|r| (r.get("resource_id"), r.get("relation")))
            .collect())
    }
}

pub fn validate_resource(resource_id: &str) -> anyhow::Result<()> {
    let id = resource_id
        .strip_prefix("urc-")
        .ok_or_else(|| anyhow::anyhow!("repository resource must start with urc-"))?;
    anyhow::ensure!(
        id.len() == 32 && id.bytes().all(|b| b.is_ascii_hexdigit()),
        "repository resource must contain exactly 32 hexadecimal characters"
    );
    anyhow::ensure!(
        !resource_id.contains('*'),
        "wildcard resources are forbidden"
    );
    Ok(())
}

fn validate_subject(subject: &str) -> anyhow::Result<()> {
    anyhow::ensure!(
        !subject.trim().is_empty() && subject.len() <= 128 && !subject.contains('*'),
        "invalid subject"
    );
    Ok(())
}

pub fn public_key_id(candidate: &str) -> anyhow::Result<Uuid> {
    let (prefix, _) = candidate
        .split_once('.')
        .ok_or_else(|| anyhow::anyhow!("malformed API key"))?;
    Ok(prefix
        .strip_prefix("lore_sk_")
        .ok_or_else(|| anyhow::anyhow!("malformed API key"))?
        .parse()?)
}

fn generate_api_key(
    pepper: &[u8],
    expires_at: DateTime<Utc>,
) -> anyhow::Result<(String, StoredApiKey)> {
    let key_id = Uuid::new_v4();
    let mut secret = [0_u8; 32];
    OsRng.fill_bytes(&mut secret);
    let secret_hmac = api_key_digest(pepper, key_id, &secret);
    Ok((
        format!("lore_sk_{key_id}.{}", URL_SAFE_NO_PAD.encode(secret)),
        StoredApiKey {
            key_id,
            secret_hmac,
            expires_at,
            revoked_at: None,
        },
    ))
}

fn verify_api_key(
    candidate: &str,
    stored: &StoredApiKey,
    pepper: &[u8],
    now: DateTime<Utc>,
) -> anyhow::Result<()> {
    anyhow::ensure!(
        stored.revoked_at.is_none() && now < stored.expires_at,
        "API key is inactive"
    );
    let (prefix, secret_text) = candidate
        .split_once('.')
        .ok_or_else(|| anyhow::anyhow!("malformed API key"))?;
    let key_id: Uuid = prefix
        .strip_prefix("lore_sk_")
        .ok_or_else(|| anyhow::anyhow!("malformed API key"))?
        .parse()?;
    anyhow::ensure!(key_id == stored.key_id, "API key authentication failed");
    let secret = URL_SAFE_NO_PAD.decode(secret_text)?;
    anyhow::ensure!(secret.len() == 32, "malformed API key");
    let mut mac = HmacSha256::new_from_slice(pepper)?;
    mac.update(key_id.as_bytes());
    mac.update(&secret);
    mac.verify_slice(&stored.secret_hmac)
        .map_err(|_| anyhow::anyhow!("API key authentication failed"))
}

fn api_key_digest(pepper: &[u8], key_id: Uuid, secret: &[u8]) -> [u8; 32] {
    let mut mac = HmacSha256::new_from_slice(pepper).expect("validated pepper");
    mac.update(key_id.as_bytes());
    mac.update(secret);
    mac.finalize().into_bytes().into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::postgres::PgPoolOptions;

    #[test]
    fn rejects_wildcard_and_malformed_resources() {
        assert!(validate_resource("urc-0123456789abcdef0123456789abcdef").is_ok());
        assert!(validate_resource("urc-*").is_err());
        assert!(validate_resource("urc-0123").is_err());
    }

    #[tokio::test]
    #[ignore = "requires AUTH_GATEWAY_TEST_DATABASE_URL pointing at disposable PostgreSQL"]
    async fn postgres_persists_sessions_relationships_and_api_key_lifecycle() {
        let database_url = std::env::var("AUTH_GATEWAY_TEST_DATABASE_URL")
            .expect("AUTH_GATEWAY_TEST_DATABASE_URL is required");
        let pool = PgPoolOptions::new()
            .max_connections(2)
            .connect(&database_url)
            .await
            .expect("connect to disposable PostgreSQL");
        let store = SecurityStore::new(pool);
        store.run_migration().await.expect("apply migrations");

        let client_state = Uuid::new_v4();
        let session = store
            .start_session(client_state, "a".repeat(64))
            .await
            .expect("start session");
        store
            .complete_session(
                session.oauth_state,
                "owner-user",
                "Owner User",
                "owner@example.test",
            )
            .await
            .expect("complete session");
        assert!(store
            .consume_session(client_state, session.session_code)
            .await
            .expect("consume session")
            .is_some());
        assert!(store
            .consume_session(client_state, session.session_code)
            .await
            .expect("retry consumed session")
            .is_none());

        let pepper = [7_u8; 32];
        let account = format!("ci-{}", Uuid::new_v4());
        let key = store
            .issue_api_key(&pepper, "test-v1", &account, "CI", 30, None)
            .await
            .expect("issue API key");
        assert_eq!(
            store
                .authenticate_api_key(&key, &pepper)
                .await
                .expect("authenticate API key")
                .subject_id,
            account
        );

        let resource = format!("urc-{}", Uuid::new_v4().simple());
        store
            .upsert_repository_owner(Uuid::new_v4(), &resource, "user", "owner-user", true)
            .await
            .expect("bootstrap owner");
        assert!(
            store
                .upsert_repository_owner(Uuid::new_v4(), &resource, "user", "claimant-user", true,)
                .await
                .is_err(),
            "a different subject must not claim an existing repository"
        );
        store
            .upsert_relationship_as_owner(
                &resource,
                "user",
                "owner-user",
                "service_account",
                &account,
                "collaborator",
            )
            .await
            .expect("share with service account");
        assert_eq!(
            store
                .relationship("service_account", &account, &resource)
                .await
                .expect("read relationship")
                .as_deref(),
            Some("collaborator")
        );
        assert!(store
            .upsert_relationship_as_owner(
                &resource,
                "service_account",
                &account,
                "service_account",
                &account,
                "owner",
            )
            .await
            .is_err());
        assert!(store
            .upsert_relationship_as_owner(
                &resource,
                "user",
                "owner-user",
                "user",
                "owner-user",
                "collaborator",
            )
            .await
            .is_err());

        let old_key_id = public_key_id(&key).expect("parse public key id");
        let replacement = store
            .rotate_api_key(&pepper, "test-v1", old_key_id, 30)
            .await
            .expect("rotate API key");
        store
            .authenticate_api_key(&key, &pepper)
            .await
            .expect("old key works during overlap");
        store
            .authenticate_api_key(&replacement, &pepper)
            .await
            .expect("replacement works");
        let replacement_id = public_key_id(&replacement).expect("parse replacement id");
        store
            .revoke_api_key(replacement_id)
            .await
            .expect("revoke replacement");
        assert!(store
            .authenticate_api_key(&replacement, &pepper)
            .await
            .is_err());
        store
            .disable_service_account(&account)
            .await
            .expect("disable service account");
        assert!(store.authenticate_api_key(&key, &pepper).await.is_err());
    }
}
