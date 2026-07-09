# =============================================================================
# RDS Module - Variables
# =============================================================================

variable "name_prefix" {
  description = "Prefix for resource names."
  type        = string
}

variable "vpc_id" {
  description = "VPC ID."
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs."
  type        = list(string)
}

variable "allowed_security_group_ids" {
  description = "Security group IDs allowed to connect to the database."
  type        = list(string)
  default     = []
}

variable "instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "allocated_storage" {
  description = "Allocated storage in GB."
  type        = number
  default     = 20
}

variable "max_allocated_storage" {
  description = "Maximum allocated storage for autoscaling."
  type        = number
  default     = 100
}

variable "db_name" {
  description = "Database name."
  type        = string
  default     = "portals_cloud"
}

variable "db_username" {
  description = "Database master username."
  type        = string
  default     = "portals_admin"
}

variable "db_password" {
  description = "Database master password (auto-generated if empty)."
  type        = string
  sensitive   = true
  default     = ""
}

variable "backup_retention_days" {
  description = "Backup retention period in days."
  type        = number
  default     = 7
}

variable "skip_final_snapshot" {
  description = "Skip final snapshot on destroy."
  type        = bool
  default     = false
}

variable "deletion_protection" {
  description = "Enable deletion protection."
  type        = bool
  default     = true
}

variable "performance_insights_enabled" {
  description = "Enable Performance Insights."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Resource tags."
  type        = map(string)
  default     = {}
}
