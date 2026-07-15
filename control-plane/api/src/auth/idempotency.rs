use axum::{
    body::Body,
    extract::Request,
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::Response,
};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, warn};

/// In-memory cache for idempotency keys.
/// In production, this should be replaced with Redis or a database.
type IdempotencyCache = Arc<RwLock<HashMap<String, CachedResponse>>>;

#[derive(Clone)]
pub struct CachedResponse {
    status: StatusCode,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
}

/// Create a new idempotency cache.
/// In production with Redis enabled, this returns a Redis-backed cache.
/// Otherwise, returns an in-memory cache for development.
pub fn create_idempotency_cache(redis_url: Option<&str>) -> IdempotencyCache {
    // For now, always use in-memory cache
    // TODO: Implement Redis backend when redis-idempotency feature is enabled
    if let Some(url) = redis_url {
        warn!(redis_url = %url, "Redis URL provided but Redis backend not yet implemented, falling back to in-memory cache");
    }
    Arc::new(RwLock::new(HashMap::new()))
}

/// Idempotency middleware.
///
/// Checks for an Idempotency-Key header. If present and the key has been seen before,
/// returns the cached response. Otherwise, processes the request and caches the response.
pub async fn idempotency_middleware(
    cache: IdempotencyCache,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // Extract idempotency key from header
    let idempotency_key = extract_idempotency_key(request.headers());

    if let Some(key) = idempotency_key {
        // Check if we have a cached response
        {
            let cache_read = cache.read().await;
            if let Some(cached) = cache_read.get(&key) {
                debug!(key = %key, "Returning cached response for idempotency key");
                
                let mut response = Response::new(Body::from(cached.body.clone()));
                *response.status_mut() = cached.status;
                
                for (name, value) in &cached.headers {
                    if let Ok(header_name) = axum::http::HeaderName::from_bytes(name.as_bytes()) {
                        if let Ok(header_value) = axum::http::HeaderValue::from_str(value) {
                            response.headers_mut().insert(header_name, header_value);
                        }
                    }
                }
                
                return Ok(response);
            }
        }

        // Process the request
        let response = next.run(request).await;
        
        // Cache the response for successful requests
        if response.status().is_success() || response.status() == StatusCode::ACCEPTED {
            let (parts, body) = response.into_parts();
            let body_bytes = axum::body::to_bytes(body, usize::MAX).await
                .map_err(|e| {
                    warn!(error = %e, "Failed to read response body for idempotency caching");
                    StatusCode::INTERNAL_SERVER_ERROR
                })?;
            
            let cached = CachedResponse {
                status: parts.status,
                headers: parts.headers
                    .iter()
                    .map(|(name, value)| (name.to_string(), value.to_str().unwrap_or("").to_string()))
                    .collect(),
                body: body_bytes.to_vec(),
            };
            
            let mut cache_write = cache.write().await;
            cache_write.insert(key, cached);
            
            // Reconstruct response
            let mut new_response = Response::new(Body::from(body_bytes));
            *new_response.status_mut() = parts.status;
            *new_response.headers_mut() = parts.headers;
            
            Ok(new_response)
        } else {
            // Don't cache error responses
            let (parts, body) = response.into_parts();
            let body_bytes = axum::body::to_bytes(body, usize::MAX).await
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            
            let new_response = Response::from_parts(parts, Body::from(body_bytes));
            Ok(new_response)
        }
    } else {
        // No idempotency key, proceed normally
        Ok(next.run(request).await)
    }
}

/// Extract the Idempotency-Key header from the request.
fn extract_idempotency_key(headers: &HeaderMap) -> Option<String> {
    headers
        .get("Idempotency-Key")
        .and_then(|h| h.to_str().ok())
        .map(|s| s.to_string())
}
