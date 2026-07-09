# =============================================================================
# Production Environment Variables
# =============================================================================

# ---------------------------------------------------------------------------
# AWS Configuration
# ---------------------------------------------------------------------------
variable "aws_region" {
  description = "AWS region for deployment."
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (production, staging, etc.)."
  type        = string
  default     = "production"
}

# ---------------------------------------------------------------------------
# Domain / DNS
# ---------------------------------------------------------------------------
variable "domain_name" {
  description = "Domain name for Route53 (e.g., portals.example.com). If empty, raw ALB/NLB DNS names are used."
  type        = string
  default     = ""
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone ID (required if domain_name is set)."
  type        = string
  default     = ""
}

# ---------------------------------------------------------------------------
# JWT Configuration
# ---------------------------------------------------------------------------
variable "jwt_issuer" {
  description = "JWT issuer claim."
  type        = string
  default     = "portals-cloud"
}

variable "jwt_audience" {
  description = "JWT audience claim."
  type        = list(string)
  default     = ["lore-server"]
}

# ---------------------------------------------------------------------------
# RDS Configuration
# ---------------------------------------------------------------------------
variable "rds_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "rds_allocated_storage" {
  description = "RDS allocated storage in GB."
  type        = number
  default     = 20
}

variable "rds_db_name" {
  description = "RDS database name."
  type        = string
  default     = "portals_cloud"
}

variable "rds_db_username" {
  description = "RDS database master username."
  type        = string
  default     = "portals_admin"
}

variable "rds_backup_retention_days" {
  description = "RDS backup retention days."
  type        = number
  default     = 7
}

variable "rds_db_password" {
  description = "RDS database master password (required)."
  type        = string
  sensitive   = true
}

variable "rds_skip_final_snapshot" {
  description = "Skip final snapshot on destroy (set false for production)."
  type        = bool
  default     = false
}

variable "rds_deletion_protection" {
  description = "Enable RDS deletion protection."
  type        = bool
  default     = true
}

variable "rds_performance_insights_enabled" {
  description = "Enable RDS Performance Insights."
  type        = bool
  default     = false
}

# ---------------------------------------------------------------------------
# Resource Naming
# ---------------------------------------------------------------------------
variable "s3_bucket_name" {
  description = "S3 bucket name for Lore fragments."
  type        = string
  default     = "portals-cloud-production-fragments"
}

variable "dynamodb_fragments_table_name" {
  description = "DynamoDB fragments table name."
  type        = string
  default     = "portals-cloud-fragments"
}

variable "dynamodb_metadata_table_name" {
  description = "DynamoDB metadata table name."
  type        = string
  default     = "portals-cloud-fragment-metadata"
}

variable "ecr_repository_names" {
  description = "ECR repository names."
  type        = list(string)
  default     = [
    "portals-cloud/lore-server",
    "portals-cloud/server",
    "portals-cloud/frontend"
  ]
}

# ---------------------------------------------------------------------------
# VPC Configuration
# ---------------------------------------------------------------------------
variable "vpc_cidr" {
  description = "VPC CIDR block."
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "Availability zones (empty to auto-discover)."
  type        = list(string)
  default     = []
}

# ---------------------------------------------------------------------------
# Image Tags
# ---------------------------------------------------------------------------
variable "lore_image_tag" {
  description = "Docker image tag for Lore server."
  type        = string
  default     = "latest"
}

variable "server_image_tag" {
  description = "Docker image tag for Server API."
  type        = string
  default     = "latest"
}

variable "frontend_image_tag" {
  description = "Docker image tag for Frontend."
  type        = string
  default     = "latest"
}

# ---------------------------------------------------------------------------
# Task Configuration — Lore
# ---------------------------------------------------------------------------
variable "lore_cpu" {
  description = "Lore task CPU units."
  type        = number
  default     = 1024
}

variable "lore_memory" {
  description = "Lore task memory in MB."
  type        = number
  default     = 2048
}

variable "lore_desired_count" {
  description = "Lore desired task count."
  type        = number
  default     = 1
}

# ---------------------------------------------------------------------------
# Task Configuration — Server
# ---------------------------------------------------------------------------
variable "server_cpu" {
  description = "Server task CPU units."
  type        = number
  default     = 512
}

variable "server_memory" {
  description = "Server task memory in MB."
  type        = number
  default     = 1024
}

variable "server_desired_count" {
  description = "Server desired task count."
  type        = number
  default     = 2
}

# ---------------------------------------------------------------------------
# Task Configuration — Frontend
# ---------------------------------------------------------------------------
variable "frontend_cpu" {
  description = "Frontend task CPU units."
  type        = number
  default     = 256
}

variable "frontend_memory" {
  description = "Frontend task memory in MB."
  type        = number
  default     = 512
}

variable "frontend_desired_count" {
  description = "Frontend desired task count."
  type        = number
  default     = 2
}

# ---------------------------------------------------------------------------
# Frontend Configuration
# ---------------------------------------------------------------------------
variable "frontend_api_base_url" {
  description = "Base URL for API calls from the frontend (browser-side)."
  type        = string
  default     = "/api"
}

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
variable "log_retention_days" {
  description = "CloudWatch log retention in days."
  type        = number
  default     = 30
}

# ---------------------------------------------------------------------------
# Tags
# ---------------------------------------------------------------------------
variable "tags" {
  description = "Resource tags."
  type        = map(string)
  default = {
    Project   = "PortalsCloud"
    ManagedBy = "Terraform"
  }
}
