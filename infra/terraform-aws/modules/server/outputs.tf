output "service_name" {
  description = "Server ECS service name."
  value       = aws_ecs_service.server.name
}

output "task_definition_arn" {
  description = "Server task definition ARN."
  value       = aws_ecs_task_definition.server.arn
}

output "security_group_id" {
  description = "Server ECS security group ID."
  value       = aws_security_group.server.id
}
