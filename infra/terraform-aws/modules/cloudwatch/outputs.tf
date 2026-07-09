output "lore_log_group_name" {
  description = "CloudWatch log group name for the Lore server."
  value       = aws_cloudwatch_log_group.lore_server.name
}

output "lore_log_group_arn" {
  description = "ARN of the CloudWatch log group for the Lore server."
  value       = aws_cloudwatch_log_group.lore_server.arn
}

output "server_log_group_name" {
  description = "CloudWatch log group name for the Server API."
  value       = aws_cloudwatch_log_group.server.name
}

output "server_log_group_arn" {
  description = "ARN of the CloudWatch log group for the Server API."
  value       = aws_cloudwatch_log_group.server.arn
}

output "frontend_log_group_name" {
  description = "CloudWatch log group name for the Frontend."
  value       = aws_cloudwatch_log_group.frontend.name
}

output "frontend_log_group_arn" {
  description = "ARN of the CloudWatch log group for the Frontend."
  value       = aws_cloudwatch_log_group.frontend.arn
}
