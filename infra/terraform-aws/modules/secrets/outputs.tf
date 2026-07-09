# =============================================================================
# Secrets Module - Outputs
# =============================================================================

output "jwt_private_key_arn" {
  description = "JWT private key secret ARN."
  value       = aws_secretsmanager_secret.jwt_private_key.arn
}

output "jwt_public_key_arn" {
  description = "JWT public key secret ARN."
  value       = aws_secretsmanager_secret.jwt_public_key.arn
}

output "jwt_kid" {
  description = "JWT key ID."
  value       = local.jwt_kid
}

output "database_url_arn" {
  description = "Database URL secret ARN."
  value       = aws_secretsmanager_secret.database_url.arn
}

output "app_secrets_arn" {
  description = "Aggregated app secrets ARN."
  value       = aws_secretsmanager_secret.app_secrets.arn
}

output "hmac_key_arn" {
  description = "HMAC key secret ARN for Lore presigned URLs."
  value       = aws_secretsmanager_secret.hmac_key.arn
}

output "jwks_arn" {
  description = "JWKS public key set secret ARN."
  value       = aws_secretsmanager_secret.jwks.arn
}

output "jwks_content" {
  description = "JWKS JSON string for sidecar container."
  value       = local.jwks_string
}
