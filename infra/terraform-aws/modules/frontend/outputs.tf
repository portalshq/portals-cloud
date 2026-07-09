output "service_name" {
  description = "Frontend ECS service name."
  value       = aws_ecs_service.frontend.name
}

output "task_definition_arn" {
  description = "Frontend task definition ARN."
  value       = aws_ecs_task_definition.frontend.arn
}

output "security_group_id" {
  description = "Frontend ECS security group ID."
  value       = aws_security_group.frontend.id
}
