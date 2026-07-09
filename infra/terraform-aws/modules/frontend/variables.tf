# =============================================================================
# Frontend Module Variables
# =============================================================================

variable "cluster_id" {
  description = "ECS cluster ID."
  type        = string
}

variable "ecr_repository_url" {
  description = "ECR repository URL for Frontend image."
  type        = string
}

variable "image_tag" {
  description = "Docker image tag for Frontend."
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
  description = "ALB target group ARN for Frontend (port 80)."
  type        = string
}

variable "alb_security_group_id" {
  description = "ALB security group ID."
  type        = string
}

variable "api_base_url" {
  description = "Base URL for the API that the frontend connects to."
  type        = string
  default     = "/api"
}

variable "cpu" {
  description = "Task CPU units (256 = 0.25 vCPU)."
  type        = number
  default     = 256
}

variable "memory" {
  description = "Task memory in MB."
  type        = number
  default     = 512
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
  description = "CloudWatch log group name for Frontend."
  type        = string
}

variable "tags" {
  description = "Resource tags."
  type        = map(string)
  default     = {}
}
