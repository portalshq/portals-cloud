# =============================================================================
# ALB Module - Variables
# =============================================================================

variable "name_prefix" {
  description = "Prefix for resource names."
  type        = string
}

variable "vpc_id" {
  description = "VPC ID."
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnet IDs."
  type        = list(string)
}

variable "certificate_arn" {
  description = "ACM certificate ARN for HTTPS listener (empty string to skip HTTPS)."
  type        = string
  default     = ""
}

variable "lore_container_port" {
  description = "Lore container port."
  type        = number
  default     = 41337
}

variable "server_container_port" {
  description = "Server container port."
  type        = number
  default     = 8899
}

variable "frontend_container_port" {
  description = "Frontend container port."
  type        = number
  default     = 80
}

variable "enable_deletion_protection" {
  description = "Enable ALB deletion protection."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Resource tags."
  type        = map(string)
  default     = {}
}
