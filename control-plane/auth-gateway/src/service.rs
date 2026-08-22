use crate::{
    config::GatewayConfig,
    jwt::{Claims, KmsJwtSigner, ResourcePermission, JWT_AUDIENCES},
    oauth::CognitoOauth,
    proto::epic_urc::{
        self,
        urc_auth_api_server::{UrcAuthApi, UrcAuthApiServer},
        *,
    },
    proto::ucs_auth::{
        rebac_api_server::{RebacApi, RebacApiServer},
        ConfirmResourceDeletedRequest, ConfirmResourceDeletedResponse, CreateResourceRequest,
        CreateResourceResponse, DeleteResourceRequest, DeleteResourceResponse,
    },
    store::SecurityStore,
};
use aws_config::BehaviorVersion;
use axum::{
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::{Html, IntoResponse},
    routing::{delete, get, post, put},
    Json, Router,
};
use base64::Engine;
use chrono::Utc;
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use sqlx::postgres::PgPoolOptions;
use std::{sync::Arc, time::Duration};
use subtle::ConstantTimeEq;
use tonic::{metadata::MetadataMap, transport::Server, Request, Response, Status};
use tracing::{error, info};
use uuid::Uuid;

type HmacSha256 = Hmac<Sha256>;

#[derive(Clone)]
struct GatewayState {
    config: GatewayConfig,
    store: SecurityStore,
    oauth: CognitoOauth,
    signer: KmsJwtSigner,
    pepper: Arc<Vec<u8>>,
    pepper_version: String,
}

#[derive(Clone)]
struct AuthService {
    state: GatewayState,
}
#[derive(Clone)]
struct RebacService {
    state: GatewayState,
}

fn internal_error(error: impl std::fmt::Display) -> Status {
    error!(%error, "auth gateway operation failed");
    Status::internal("authentication service operation failed")
}

fn bearer(metadata: &MetadataMap) -> Result<&str, Status> {
    metadata
        .get("authorization")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .ok_or_else(|| Status::unauthenticated("Bearer token is required"))
}

fn subject_type(claims: &Claims) -> &'static str {
    if claims.is_service_account {
        "service_account"
    } else {
        "user"
    }
}

async fn require_active(state: &GatewayState, claims: &Claims) -> Result<(), Status> {
    if state
        .store
        .principal_active(subject_type(claims), &claims.sub)
        .await
        .map_err(internal_error)?
    {
        Ok(())
    } else {
        Err(Status::permission_denied("principal is disabled"))
    }
}

fn permissions(relation: &str) -> Vec<String> {
    let mut result = vec!["read".into(), "write".into()];
    if relation == "owner" {
        result.extend(["share".into(), "delete".into()]);
    }
    result
}

fn user_token(token: String, claims: &Claims) -> UserToken {
    UserToken {
        user_token: token,
        expires_at: claims.exp.saturating_mul(1000),
        user_id: claims.sub.clone(),
        user_name: claims.name.clone(),
    }
}

#[tonic::async_trait]
impl UrcAuthApi for AuthService {
    async fn health_check(
        &self,
        _: Request<HealthCheckRequest>,
    ) -> Result<Response<HealthCheckResponse>, Status> {
        if !self.state.store.is_healthy().await {
            return Err(Status::unavailable("authentication store unavailable"));
        }
        Ok(Response::new(HealthCheckResponse {
            status: "ok".into(),
        }))
    }

    async fn start_auth_session(
        &self,
        request: Request<StartAuthSessionRequest>,
    ) -> Result<Response<StartAuthSessionResponse>, Status> {
        let client_state = request
            .into_inner()
            .client_state
            .parse::<Uuid>()
            .map_err(|_| Status::invalid_argument("client_state must be a UUID"))?;
        let (session, login_url) = self
            .state
            .oauth
            .start(client_state)
            .await
            .map_err(internal_error)?;
        Ok(Response::new(StartAuthSessionResponse {
            session_code: session.session_code.to_string(),
            login_url,
        }))
    }

    async fn get_auth_session(
        &self,
        request: Request<GetAuthSessionRequest>,
    ) -> Result<Response<GetAuthSessionResponse>, Status> {
        if !self.state.config.jwt_signing_enabled {
            return Err(Status::unavailable("JWT signing is not activated"));
        }
        let input = request.into_inner();
        let client_state = input
            .client_state
            .parse()
            .map_err(|_| Status::invalid_argument("client_state must be a UUID"))?;
        let session_code = input
            .session_code
            .parse()
            .map_err(|_| Status::invalid_argument("session_code must be a UUID"))?;
        let Some(session) = self
            .state
            .store
            .consume_session(client_state, session_code)
            .await
            .map_err(internal_error)?
        else {
            return Ok(Response::new(GetAuthSessionResponse { user_token: None }));
        };
        let (token, exp) = self
            .state
            .signer
            .authentication_token(
                &session.subject_id,
                &session.display_name,
                &session.preferred_username,
                false,
                "cognito",
            )
            .await
            .map_err(internal_error)?;
        let claims = Claims {
            sub: session.subject_id,
            iss: self.state.config.jwt_issuer.clone(),
            iat: Utc::now().timestamp(),
            exp,
            aud: JWT_AUDIENCES.iter().map(|a| (*a).to_string()).collect(),
            env: self.state.config.environment.clone(),
            name: session.display_name,
            preferred_username: session.preferred_username,
            is_service_account: false,
            resources: None,
            groups: None,
            idp: "cognito".into(),
        };
        Ok(Response::new(GetAuthSessionResponse {
            user_token: Some(user_token(token, &claims)),
        }))
    }

    async fn refresh_auth_session(
        &self,
        _: Request<RefreshAuthSessionRequest>,
    ) -> Result<Response<RefreshAuthSessionResponse>, Status> {
        Err(Status::unimplemented(
            "refresh tokens are intentionally not issued; login again after eight hours",
        ))
    }

    async fn verify_user(
        &self,
        request: Request<VerifyUserRequest>,
    ) -> Result<Response<VerifyUserResponse>, Status> {
        let input = request.into_inner();
        let token = input
            .target_user
            .and_then(|target| target.user)
            .and_then(|user| match user {
                target_user::User::UserToken(token) => Some(token),
            })
            .ok_or_else(|| Status::unauthenticated("user token is required"))?;
        let claims = self
            .state
            .signer
            .verify_authentication(&token)
            .map_err(|_| Status::unauthenticated("invalid authentication token"))?;
        require_active(&self.state, &claims).await?;
        Ok(Response::new(VerifyUserResponse {
            user_info: Some(UserInfo {
                user_id: claims.sub,
                display_name: claims.name,
            }),
        }))
    }

    async fn exchange_external_token_for_user_token(
        &self,
        request: Request<ExchangeExternalTokenForUserTokenRequest>,
    ) -> Result<Response<ExchangeExternalTokenForUserTokenResponse>, Status> {
        let input = request.into_inner();
        if input.token_type != "api-key" {
            return Err(Status::invalid_argument(
                "only api-key exchange is supported",
            ));
        }
        self.exchange_api_key(&input.external_token)
            .await
            .map(|token| {
                Response::new(ExchangeExternalTokenForUserTokenResponse {
                    user_token: Some(token),
                })
            })
    }

    async fn exchange_api_key_for_user_token(
        &self,
        request: Request<ExchangeApiKeyForUserTokenRequest>,
    ) -> Result<Response<ExchangeApiKeyForUserTokenResponse>, Status> {
        let token = self.exchange_api_key(&request.into_inner().api_key).await?;
        Ok(Response::new(ExchangeApiKeyForUserTokenResponse {
            user_token: Some(token),
        }))
    }

    async fn exchange_user_token_for_multiresource_token(
        &self,
        request: Request<ExchangeUserTokenForMultiresourceTokenRequest>,
    ) -> Result<Response<ExchangeUserTokenForMultiresourceTokenResponse>, Status> {
        if !self.state.config.jwt_signing_enabled {
            return Err(Status::unavailable("JWT signing is not activated"));
        }
        let authn = self
            .state
            .signer
            .verify_authentication(bearer(request.metadata())?)
            .map_err(|_| Status::unauthenticated("invalid authentication token"))?;
        let resources = &request.get_ref().resource_id;
        if resources.len() != 1 {
            return Err(Status::invalid_argument(
                "exactly one repository resource is required",
            ));
        }
        let resource_id = &resources[0];
        crate::store::validate_resource(resource_id)
            .map_err(|_| Status::invalid_argument("invalid repository resource"))?;
        if !self
            .state
            .store
            .principal_active(subject_type(&authn), &authn.sub)
            .await
            .map_err(internal_error)?
        {
            return Err(Status::permission_denied("principal is disabled"));
        }
        let relation = self
            .state
            .store
            .relationship(subject_type(&authn), &authn.sub, resource_id)
            .await
            .map_err(internal_error)?
            .ok_or_else(|| Status::permission_denied("repository access denied"))?;
        let permission = ResourcePermission {
            resource_id: resource_id.clone(),
            permission: permissions(&relation)
                .into_iter()
                .filter(|p| p == "read" || p == "write")
                .collect(),
        };
        let (token, exp) = self
            .state
            .signer
            .authorization_token(&authn, permission)
            .await
            .map_err(internal_error)?;
        let mut claims = authn;
        claims.exp = exp;
        Ok(Response::new(
            ExchangeUserTokenForMultiresourceTokenResponse {
                token: Some(user_token(token, &claims)),
            },
        ))
    }

    async fn check_user_permission(
        &self,
        request: Request<CheckUserPermissionRequest>,
    ) -> Result<Response<CheckUserPermissionResponse>, Status> {
        let bearer_token = bearer(request.metadata())?;
        let claims = match self.state.signer.verify_authentication(bearer_token) {
            Ok(claims) => claims,
            Err(_) => {
                if request.get_ref().resource_id.len() != 1 {
                    return Err(Status::permission_denied(
                        "repository-scoped tokens may check exactly one repository",
                    ));
                }
                self.state
                    .signer
                    .verify_authorization(bearer_token, &request.get_ref().resource_id[0])
                    .map_err(|_| Status::unauthenticated("invalid token"))?
            }
        };
        let mut allowed = Vec::new();
        let mut denied = Vec::new();
        for resource in &request.get_ref().resource_id {
            match self
                .state
                .store
                .relationship(subject_type(&claims), &claims.sub, resource)
                .await
                .map_err(internal_error)?
            {
                Some(relation) => allowed.push(ResourcePermissionProto::new(
                    resource,
                    permissions(&relation),
                )),
                None => denied.push(ResourcePermissionProto::new(resource, Vec::new())),
            }
        }
        Ok(Response::new(CheckUserPermissionResponse {
            allowed_resource_permission: allowed.into_iter().map(Into::into).collect(),
            denied_resource_permission: denied.into_iter().map(Into::into).collect(),
        }))
    }

    async fn lookup_user_permissions(
        &self,
        request: Request<LookupUserPermissionsRequest>,
    ) -> Result<Response<LookupUserPermissionsResponse>, Status> {
        let claims = self
            .state
            .signer
            .verify_authentication(bearer(request.metadata())?)
            .map_err(|_| Status::unauthenticated("invalid authentication token"))?;
        let rows = self
            .state
            .store
            .resources_for(subject_type(&claims), &claims.sub)
            .await
            .map_err(internal_error)?;
        let result = rows
            .into_iter()
            .filter(|(resource, _)| {
                request.get_ref().resource_filter.is_empty()
                    || resource.starts_with(&request.get_ref().resource_filter)
            })
            .map(|(resource, relation)| epic_urc::ResourcePermission {
                resource_id: resource,
                permission: permissions(&relation),
            })
            .collect();
        Ok(Response::new(LookupUserPermissionsResponse {
            resource_permission: result,
            next_page_token: None,
        }))
    }

    async fn get_user_info(
        &self,
        request: Request<GetUserInfoRequest>,
    ) -> Result<Response<GetUserInfoResponse>, Status> {
        self.state
            .signer
            .verify_authorization(bearer(request.metadata())?, &request.get_ref().resource_id)
            .map_err(|_| Status::permission_denied("repository authorization required"))?;
        let mut users = Vec::new();
        for id in &request.get_ref().user_id {
            if let Some(principal) = self
                .state
                .store
                .principal("user", id)
                .await
                .map_err(internal_error)?
            {
                users.push(UserInfo {
                    user_id: principal.subject_id,
                    display_name: principal.display_name,
                });
            }
        }
        Ok(Response::new(GetUserInfoResponse { user_info: users }))
    }

    async fn get_user_id(
        &self,
        request: Request<GetUserIdRequest>,
    ) -> Result<Response<GetUserIdResponse>, Status> {
        self.state
            .signer
            .verify_authorization(bearer(request.metadata())?, &request.get_ref().resource_id)
            .map_err(|_| Status::permission_denied("repository authorization required"))?;
        let principal = self
            .state
            .store
            .principal_by_username(&request.get_ref().user_display_name)
            .await
            .map_err(internal_error)?;
        Ok(Response::new(GetUserIdResponse {
            user_info: principal.map(|p| UserInfo {
                user_id: p.subject_id,
                display_name: p.display_name,
            }),
        }))
    }

    async fn get_provider_user_id(
        &self,
        request: Request<GetProviderUserIdRequest>,
    ) -> Result<Response<GetProviderUserIdResponse>, Status> {
        let claims = self
            .state
            .signer
            .verify_authentication(bearer(request.metadata())?)
            .map_err(|_| Status::unauthenticated("invalid authentication token"))?;
        if claims.sub != request.get_ref().user_id {
            return Err(Status::permission_denied(
                "cannot inspect another provider identity",
            ));
        }
        Ok(Response::new(GetProviderUserIdResponse {
            user_id: claims.sub.clone(),
            provider_user_id: claims.sub,
        }))
    }
}

struct ResourcePermissionProto {
    resource_id: String,
    permission: Vec<String>,
}
impl ResourcePermissionProto {
    fn new(resource: &str, permission: Vec<String>) -> Self {
        Self {
            resource_id: resource.into(),
            permission,
        }
    }
}
impl From<ResourcePermissionProto> for epic_urc::ResourcePermission {
    fn from(value: ResourcePermissionProto) -> Self {
        Self {
            resource_id: value.resource_id,
            permission: value.permission,
        }
    }
}

impl AuthService {
    async fn exchange_api_key(&self, candidate: &str) -> Result<UserToken, Status> {
        if !self.state.config.jwt_signing_enabled {
            return Err(Status::unavailable("JWT signing is not activated"));
        }
        let principal = self
            .state
            .store
            .authenticate_api_key(candidate, &self.state.pepper)
            .await
            .map_err(|_| Status::unauthenticated("API key authentication failed"))?;
        let (token, exp) = self
            .state
            .signer
            .authentication_token(
                &principal.subject_id,
                &principal.display_name,
                &principal.preferred_username,
                true,
                "service-account",
            )
            .await
            .map_err(internal_error)?;
        let claims = Claims {
            sub: principal.subject_id,
            iss: self.state.config.jwt_issuer.clone(),
            iat: Utc::now().timestamp(),
            exp,
            aud: JWT_AUDIENCES.iter().map(|a| (*a).to_string()).collect(),
            env: self.state.config.environment.clone(),
            name: principal.display_name,
            preferred_username: principal.preferred_username,
            is_service_account: true,
            resources: None,
            groups: None,
            idp: "service-account".into(),
        };
        Ok(user_token(token, &claims))
    }
}

#[tonic::async_trait]
impl RebacApi for RebacService {
    async fn create_resource(
        &self,
        request: Request<CreateResourceRequest>,
    ) -> Result<Response<CreateResourceResponse>, Status> {
        let claims = self
            .state
            .signer
            .verify_authentication(bearer(request.metadata())?)
            .map_err(|_| Status::unauthenticated("valid authentication token required"))?;
        require_active(&self.state, &claims).await?;
        let resource = &request.get_ref().resource_id;
        crate::store::validate_resource(resource)
            .map_err(|_| Status::invalid_argument("invalid repository resource"))?;
        self.state
            .store
            .upsert_repository_owner(
                Uuid::new_v4(),
                resource,
                subject_type(&claims),
                &claims.sub,
                true,
            )
            .await
            .map_err(internal_error)?;
        Ok(Response::new(CreateResourceResponse {}))
    }
    async fn delete_resource(
        &self,
        request: Request<DeleteResourceRequest>,
    ) -> Result<Response<DeleteResourceResponse>, Status> {
        let claims = self
            .state
            .signer
            .verify_authentication(bearer(request.metadata())?)
            .map_err(|_| Status::unauthenticated("valid authentication token required"))?;
        require_active(&self.state, &claims).await?;
        let resource = &request.get_ref().resource_id;
        self.state
            .store
            .request_repository_deletion(resource, subject_type(&claims), &claims.sub)
            .await
            .map_err(|_| Status::permission_denied("only a repository owner may delete"))?;
        Ok(Response::new(DeleteResourceResponse {}))
    }

    async fn confirm_resource_deleted(
        &self,
        request: Request<ConfirmResourceDeletedRequest>,
    ) -> Result<Response<ConfirmResourceDeletedResponse>, Status> {
        let claims = self
            .state
            .signer
            .verify_authentication(bearer(request.metadata())?)
            .map_err(|_| Status::unauthenticated("valid authentication token required"))?;
        require_active(&self.state, &claims).await?;
        self.state
            .store
            .confirm_repository_deletion(
                &request.get_ref().resource_id,
                subject_type(&claims),
                &claims.sub,
            )
            .await
            .map_err(|_| Status::permission_denied("repository deletion was not authorized"))?;
        Ok(Response::new(ConfirmResourceDeletedResponse {}))
    }
}

#[derive(Deserialize)]
struct CallbackQuery {
    state: Uuid,
    code: Option<String>,
    error: Option<String>,
}
async fn callback(
    State(state): State<GatewayState>,
    Query(query): Query<CallbackQuery>,
) -> impl IntoResponse {
    if let Some(error) = query.error {
        tracing::warn!(oauth_error = %error, "Cognito returned an OAuth error");
        return (
            StatusCode::BAD_REQUEST,
            Html(String::from(
                "Authentication failed. Return to the CLI and try again.",
            )),
        );
    }
    let Some(code) = query.code else {
        return (
            StatusCode::BAD_REQUEST,
            Html("Authentication code is missing".into()),
        );
    };
    match state.oauth.complete(query.state, &code).await {
        Ok(()) => (
            StatusCode::OK,
            Html("Authentication complete. You may close this window.".into()),
        ),
        Err(error) => {
            tracing::warn!(%error, "OAuth callback rejected");
            (
                StatusCode::BAD_REQUEST,
                Html("Authentication failed. Return to the CLI and try again.".into()),
            )
        }
    }
}
async fn jwks(State(state): State<GatewayState>) -> Json<crate::jwt::Jwks> {
    Json(state.signer.jwks().clone())
}
async fn health(State(state): State<GatewayState>) -> StatusCode {
    if state.store.is_healthy().await {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct IssueKey {
    service_account_id: String,
    display_name: String,
    lifetime_days: i64,
}
#[derive(Serialize)]
struct IssuedKey {
    api_key: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RelationshipMutation {
    subject_type: String,
    subject_id: String,
    relation: String,
}

fn authorize_internal(headers: &HeaderMap, expected: &str) -> Result<(), StatusCode> {
    let presented = headers
        .get("authorization")
        .and_then(|h| h.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "))
        .unwrap_or("");
    let mut left = HmacSha256::new_from_slice(expected.as_bytes()).expect("HMAC key");
    left.update(b"auth-gateway-internal");
    let mut right = HmacSha256::new_from_slice(presented.as_bytes()).expect("HMAC key");
    right.update(b"auth-gateway-internal");
    if bool::from(
        left.finalize()
            .into_bytes()
            .ct_eq(&right.finalize().into_bytes()),
    ) {
        Ok(())
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
}

async fn actor_claims(state: &GatewayState, headers: &HeaderMap) -> Result<Claims, StatusCode> {
    let token = headers
        .get("x-portals-actor-token")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .ok_or(StatusCode::UNAUTHORIZED)?;
    let claims = state
        .signer
        .verify_authentication(token)
        .map_err(|_| StatusCode::UNAUTHORIZED)?;
    if !state
        .store
        .principal_active(subject_type(&claims), &claims.sub)
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?
    {
        return Err(StatusCode::FORBIDDEN);
    }
    Ok(claims)
}

async fn issue_key(
    State(state): State<GatewayState>,
    headers: HeaderMap,
    Json(input): Json<IssueKey>,
) -> Result<Json<IssuedKey>, StatusCode> {
    authorize_internal(&headers, &state.config.internal_admin_token)?;
    let key = state
        .store
        .issue_api_key(
            &state.pepper,
            &state.pepper_version,
            &input.service_account_id,
            &input.display_name,
            input.lifetime_days,
            None,
        )
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    Ok(Json(IssuedKey { api_key: key }))
}
async fn rotate_key(
    State(state): State<GatewayState>,
    headers: HeaderMap,
    axum::extract::Path(key_id): axum::extract::Path<Uuid>,
) -> Result<Json<IssuedKey>, StatusCode> {
    authorize_internal(&headers, &state.config.internal_admin_token)?;
    let key = state
        .store
        .rotate_api_key(&state.pepper, &state.pepper_version, key_id, 90)
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    Ok(Json(IssuedKey { api_key: key }))
}
async fn revoke_key(
    State(state): State<GatewayState>,
    headers: HeaderMap,
    axum::extract::Path(key_id): axum::extract::Path<Uuid>,
) -> Result<StatusCode, StatusCode> {
    authorize_internal(&headers, &state.config.internal_admin_token)?;
    state
        .store
        .revoke_api_key(key_id)
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    Ok(StatusCode::NO_CONTENT)
}
async fn disable_service_account(
    State(state): State<GatewayState>,
    headers: HeaderMap,
    axum::extract::Path(subject): axum::extract::Path<String>,
) -> Result<StatusCode, StatusCode> {
    authorize_internal(&headers, &state.config.internal_admin_token)?;
    state
        .store
        .disable_service_account(&subject)
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    Ok(StatusCode::NO_CONTENT)
}
async fn upsert_relationship(
    State(state): State<GatewayState>,
    headers: HeaderMap,
    axum::extract::Path(resource): axum::extract::Path<String>,
    Json(input): Json<RelationshipMutation>,
) -> Result<StatusCode, StatusCode> {
    authorize_internal(&headers, &state.config.internal_admin_token)?;
    let actor = actor_claims(&state, &headers).await?;
    // Owner bootstrap is performed only by Lore's private ReBAC RPC after
    // durable repository creation. This endpoint can modify an existing
    // repository only after authenticating one of its current owners.
    state
        .store
        .upsert_relationship_as_owner(
            &resource,
            subject_type(&actor),
            &actor.sub,
            &input.subject_type,
            &input.subject_id,
            &input.relation,
        )
        .await
        .map_err(|_| StatusCode::FORBIDDEN)?;
    Ok(StatusCode::NO_CONTENT)
}

async fn remove_relationship(
    State(state): State<GatewayState>,
    headers: HeaderMap,
    axum::extract::Path((resource, target_type, target_id)): axum::extract::Path<(
        String,
        String,
        String,
    )>,
) -> Result<StatusCode, StatusCode> {
    authorize_internal(&headers, &state.config.internal_admin_token)?;
    let actor = actor_claims(&state, &headers).await?;
    state
        .store
        .remove_relationship_as_owner(
            &resource,
            subject_type(&actor),
            &actor.sub,
            &target_type,
            &target_id,
        )
        .await
        .map_err(|_| StatusCode::FORBIDDEN)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn run(config: GatewayConfig) -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&config.database_url)
        .await?;
    let store = SecurityStore::new(pool);
    store.run_migration().await?;
    let aws = aws_config::defaults(BehaviorVersion::latest()).load().await;
    let (pepper, pepper_version) = if let Some(local) = &config.api_key_pepper_base64 {
        (
            base64::engine::general_purpose::STANDARD.decode(local)?,
            "local-development".to_string(),
        )
    } else {
        let secret = aws_sdk_secretsmanager::Client::new(&aws)
            .get_secret_value()
            .secret_id(&config.api_key_pepper_secret_arn)
            .send()
            .await?;
        (
            base64::engine::general_purpose::STANDARD.decode(
                secret
                    .secret_string()
                    .ok_or_else(|| anyhow::anyhow!("API key pepper secret has no string value"))?,
            )?,
            secret.version_id().unwrap_or("unknown").to_string(),
        )
    };
    anyhow::ensure!(
        pepper.len() == 32,
        "API key pepper must decode to exactly 32 bytes"
    );
    let signer = if let Some(path) = &config.jwt_local_private_key_path {
        KmsJwtSigner::load_local(
            &std::fs::read(path)?,
            config.jwt_kid.clone(),
            config.jwt_issuer.clone(),
            config.environment.clone(),
        )?
    } else {
        KmsJwtSigner::load_with_retired(
            aws_sdk_kms::Client::new(&aws),
            config.jwt_kms_key_id.clone(),
            config.jwt_kid.clone(),
            config.jwt_retired_kms_key_ids.clone(),
            config.jwt_issuer.clone(),
            config.environment.clone(),
        )
        .await?
    };
    let state = GatewayState {
        oauth: CognitoOauth::new(config.clone(), store.clone()),
        config: config.clone(),
        store,
        signer,
        pepper: Arc::new(pepper),
        pepper_version,
    };
    let public = Router::new()
        .route("/callback", get(callback))
        .route("/.well-known/jwks.json", get(jwks))
        .route("/healthz", get(health))
        .with_state(state.clone());
    let internal = Router::new()
        .route("/v1/api-keys", post(issue_key))
        .route("/v1/api-keys/:key_id/rotate", post(rotate_key))
        .route("/v1/api-keys/:key_id", delete(revoke_key))
        .route(
            "/v1/service-accounts/:subject/revoke",
            post(disable_service_account),
        )
        .route(
            "/v1/repositories/:resource/relationships",
            put(upsert_relationship),
        )
        .route(
            "/v1/repositories/:resource/relationships/:target_type/:target_id",
            delete(remove_relationship),
        )
        .route("/healthz", get(health))
        .with_state(state.clone());
    let (health_reporter, health_service) = tonic_health::server::health_reporter();
    health_reporter
        .set_service_status("", tonic_health::ServingStatus::NotServing)
        .await;
    let health_store = state.store.clone();
    tokio::spawn(async move {
        loop {
            let status = if health_store.is_healthy().await {
                tonic_health::ServingStatus::Serving
            } else {
                tonic_health::ServingStatus::NotServing
            };
            health_reporter.set_service_status("", status).await;
            tokio::time::sleep(Duration::from_secs(15)).await;
        }
    });
    let grpc = Server::builder()
        .timeout(Duration::from_secs(30))
        .add_service(health_service)
        .add_service(UrcAuthApiServer::new(AuthService {
            state: state.clone(),
        }));
    let (rebac_health_reporter, rebac_health) = tonic_health::server::health_reporter();
    rebac_health_reporter
        .set_service_status("", tonic_health::ServingStatus::NotServing)
        .await;
    let rebac_health_store = state.store.clone();
    tokio::spawn(async move {
        loop {
            let status = if rebac_health_store.is_healthy().await {
                tonic_health::ServingStatus::Serving
            } else {
                tonic_health::ServingStatus::NotServing
            };
            rebac_health_reporter.set_service_status("", status).await;
            tokio::time::sleep(Duration::from_secs(15)).await;
        }
    });
    let rebac = Server::builder()
        .timeout(Duration::from_secs(30))
        .add_service(rebac_health)
        .add_service(RebacApiServer::new(RebacService {
            state: state.clone(),
        }));
    info!(grpc=%config.grpc_addr,http=%config.http_addr,internal=%config.internal_addr,rebac=%config.rebac_addr,"starting Auth Gateway");
    tokio::try_join!(
        async {
            grpc.serve(config.grpc_addr)
                .await
                .map_err(anyhow::Error::from)
        },
        async {
            axum::serve(
                tokio::net::TcpListener::bind(config.http_addr).await?,
                public,
            )
            .await
            .map_err(anyhow::Error::from)
        },
        async {
            axum::serve(
                tokio::net::TcpListener::bind(config.internal_addr).await?,
                internal,
            )
            .await
            .map_err(anyhow::Error::from)
        },
        async {
            rebac
                .serve(config.rebac_addr)
                .await
                .map_err(anyhow::Error::from)
        },
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn owner_permissions_are_strict_superset() {
        assert_eq!(permissions("collaborator"), vec!["read", "write"]);
        assert_eq!(
            permissions("owner"),
            vec!["read", "write", "share", "delete"]
        );
    }
    #[test]
    fn internal_token_comparison_rejects_mismatch() {
        let mut headers = HeaderMap::new();
        headers.insert("authorization", "Bearer wrong".parse().unwrap());
        assert_eq!(
            authorize_internal(&headers, "01234567890123456789012345678901"),
            Err(StatusCode::UNAUTHORIZED)
        );
    }
    #[test]
    fn api_key_parser_never_accepts_wildcards() {
        assert!(crate::store::public_key_id("lore_sk_*.secret").is_err());
    }
}
