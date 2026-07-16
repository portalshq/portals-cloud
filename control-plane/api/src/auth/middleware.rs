use axum::{
    extract::Request,
    http::StatusCode,
    middleware::Next,
    response::Response,
};
use tracing::{debug, warn};

use crate::auth::{DataPlaneClaims, DataPlaneSigningKey};

/// JWT authentication middleware.
///
/// Verifies the Authorization header contains a valid JWT token signed by the control plane.
/// Returns 401 Unauthorized if token is missing, invalid, or expired.
pub async fn jwt_auth_middleware(
    signing_key: DataPlaneSigningKey,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // Extract Authorization header
    let auth_header = request
        .headers()
        .get("Authorization")
        .and_then(|h| h.to_str().ok());

    let token = match auth_header {
        Some(header) if header.starts_with("Bearer ") => {
            Some(header[7..].to_string())
        }
        Some(_) => {
            warn!("Authorization header missing 'Bearer ' prefix");
            return Err(StatusCode::UNAUTHORIZED);
        }
        None => {
            debug!("No Authorization header provided");
            return Err(StatusCode::UNAUTHORIZED);
        }
    };

    // Verify token
    let token_str = token.as_deref().ok_or_else(|| {
        warn!("Authorization header present but token is empty");
        StatusCode::UNAUTHORIZED
    })?;
    
    let claims: DataPlaneClaims = signing_key
        .verify_data_plane_token(token_str)
        .map_err(|e| {
            warn!(error = %e, "JWT verification failed");
            StatusCode::UNAUTHORIZED
        })?;

    debug!(subject = %claims.sub, repo_id = %claims.repo_id, "JWT verified successfully");

    // Continue with the request
    Ok(next.run(request).await)
}
