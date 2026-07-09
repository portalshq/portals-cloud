# =============================================================================
# ALB Module - Outputs
# =============================================================================

output "alb_id" {
  description = "ALB ID."
  value       = aws_lb.this.id
}

output "alb_arn" {
  description = "ALB ARN."
  value       = aws_lb.this.arn
}

output "alb_dns_name" {
  description = "ALB DNS name."
  value       = aws_lb.this.dns_name
}

output "alb_zone_id" {
  description = "ALB Route53 hosted zone ID."
  value       = aws_lb.this.zone_id
}

output "lore_target_group_arn" {
  description = "Lore target group ARN."
  value       = aws_lb_target_group.lore.arn
}

output "server_target_group_arn" {
  description = "Server target group ARN."
  value       = aws_lb_target_group.server.arn
}

output "frontend_target_group_arn" {
  description = "Frontend target group ARN."
  value       = aws_lb_target_group.frontend.arn
}

output "security_group_id" {
  description = "ALB security group ID."
  value       = aws_security_group.alb.id
}
