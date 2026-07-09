# =============================================================================
# Route53 Module - Outputs
# =============================================================================

output "certificate_arn" {
  description = "ACM certificate ARN (empty string if no domain)."
  value       = local.enabled ? aws_acm_certificate_validation.this[0].certificate_arn : ""
}

output "certificate_domain" {
  description = "Certificate domain name."
  value       = local.enabled ? aws_acm_certificate.this[0].domain_name : ""
}

output "hosted_zone_id" {
  description = "Hosted zone ID."
  value       = var.hosted_zone_id
}
