# =============================================================================
# Production Environment Outputs
# =============================================================================

output "alb_dns_name" {
  description = "ALB DNS name for accessing the application."
  value       = module.alb.alb_dns_name
}

output "nlb_dns_name" {
  description = "NLB DNS name for Lore QUIC/gRPC access."
  value       = module.nlb.nlb_dns_name
}

output "lore_remote_url" {
  description = "Lore remote URL format."
  value       = "lore://${module.nlb.nlb_dns_name}:41337/${var.environment}"
}

output "app_url" {
  description = "Application URL."
  value       = var.domain_name != "" ? "https://app.${var.domain_name}" : "http://${module.alb.alb_dns_name}"
}

output "api_url" {
  description = "API URL."
  value       = var.domain_name != "" ? "https://app.${var.domain_name}/api" : "http://${module.alb.alb_dns_name}/api"
}

output "health_check_url" {
  description = "Server health check URL."
  value       = "http://${module.alb.alb_dns_name}/api/healthz"
}

output "ecr_repository_urls" {
  description = "ECR repository URLs for image pushes."
  value       = module.ecr.repository_urls
}

output "jwt_kid" {
  description = "JWT key ID for token minting."
  value       = module.secrets.jwt_kid
}

output "jwt_signing_key_secret_arn" {
  description = "JWT signing key secret ARN."
  value       = module.secrets.jwt_private_key_arn
}

output "database_endpoint" {
  description = "RDS database endpoint."
  value       = module.rds.db_instance_endpoint
}

output "certificate_arn" {
  description = "ACM certificate ARN (empty if no domain)."
  value       = module.route53_cert.certificate_arn
}

output "app_fqdn" {
  description = "App FQDN (empty if no domain)."
  value       = var.domain_name != "" ? "app.${var.domain_name}" : ""
}

output "lore_fqdn" {
  description = "Lore FQDN (empty if no domain)."
  value       = var.domain_name != "" ? "lore.${var.domain_name}" : ""
}

output "cluster_name" {
  description = "ECS cluster name."
  value       = module.ecs.cluster_name
}
