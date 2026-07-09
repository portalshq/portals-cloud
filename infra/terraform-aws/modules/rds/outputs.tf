# =============================================================================
# RDS Module - Outputs
# =============================================================================

output "db_instance_id" {
  description = "RDS instance ID."
  value       = aws_db_instance.this.id
}

output "db_instance_endpoint" {
  description = "RDS instance endpoint (host:port)."
  value       = aws_db_instance.this.endpoint
}

output "db_instance_address" {
  description = "RDS instance hostname."
  value       = aws_db_instance.this.address
}

output "db_instance_port" {
  description = "RDS instance port."
  value       = aws_db_instance.this.port
}

output "db_name" {
  description = "Database name."
  value       = aws_db_instance.this.db_name
}

output "db_username" {
  description = "Database master username."
  value       = aws_db_instance.this.username
}

output "db_password" {
  description = "Database master password."
  value       = aws_db_instance.this.password
  sensitive   = true
}

output "connection_url" {
  description = "PostgreSQL connection URL."
  value       = "postgresql://${aws_db_instance.this.username}:${urlencode(aws_db_instance.this.password)}@${aws_db_instance.this.endpoint}/${aws_db_instance.this.db_name}"
  sensitive   = true
}

output "security_group_id" {
  description = "RDS security group ID."
  value       = aws_security_group.rds.id
}
