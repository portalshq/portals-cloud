# =============================================================================
# Server Module Variables
# =============================================================================

variable "cluster_id" {
  description = "ECS cluster ID."
  type        = string
}

variable "ecr_repository_url" {
  description = "ECR repository URL for Server image."
  type        = string
}

variable "image_tag" {
  description = "Docker image tag for Server."
  type        = string
  default     = "latest"
}

variable "vpc_id" {
  description = "VPC ID."
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs."
  type        = list(string)
}

variable "alb_target_group_arn" {
  description = "ALB target group ARN for Server."
  type        = string
}

variable "alb_security_group_id" {
  description = "ALB security group ID."
  type        = string
}

variable "database_url_secret_arn" {
  description = "Secret ARN for DATABASE_URL."
  type        = string
}

variable "app_secrets_arn" {
  description = "Secret ARN for aggregated app secrets JSON."
  type        = string
  default     = ""
}

variable "lore_server_url" {
  description = "Lore HTTP server URL (e.g., http://nlb.dns.name:41337)."
  type        = string
  default     = "http://127.0.0.1:41339"
}

variable "lore_grpc_host" {
  description = "Lore gRPC host:port."
  type        = string
  default     = "127.0.0.1:41337"
}

variable "lore_quic_host" {
  description = "Lore QUIC host:port."
  type        = string
  default     = "127.0.0.1:41337"
}

variable "cpu" {
  description = "Task CPU units (512 = 0.5 vCPU)."
  type        = number
  default     = 512
}

variable "memory" {
  description = "Task memory in MB."
  type        = number
  default     = 1024
}

variable "desired_count" {
  description = "Desired number of tasks."
  type        = number
  default     = 2
}

variable "environment" {
  description = "Environment name."
  type        = string
}

variable "region" {
  description = "AWS region."
  type        = string
}

variable "cloudwatch_log_group_name" {
  description = "CloudWatch log group name for Server."
  type        = string
}

variable "tags" {
  description = "Resource tags."
  type        = map(string)
  default     = {}
}
