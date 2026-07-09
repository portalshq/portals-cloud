# =============================================================================
# NLB Module - Outputs
# =============================================================================

output "nlb_id" {
  description = "NLB ID."
  value       = aws_lb.nlb.id
}

output "nlb_arn" {
  description = "NLB ARN."
  value       = aws_lb.nlb.arn
}

output "nlb_dns_name" {
  description = "NLB DNS name."
  value       = aws_lb.nlb.dns_name
}

output "nlb_zone_id" {
  description = "NLB Route53 hosted zone ID."
  value       = aws_lb.nlb.zone_id
}

output "lore_tcp_target_group_arn" {
  description = "Lore TCP target group ARN."
  value       = aws_lb_target_group.lore_tcp.arn
}

output "lore_udp_target_group_arn" {
  description = "Lore UDP target group ARN."
  value       = aws_lb_target_group.lore_udp.arn
}

output "security_group_id" {
  description = "NLB security group ID."
  value       = aws_security_group.nlb.id
}
