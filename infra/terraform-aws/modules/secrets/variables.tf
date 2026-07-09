# =============================================================================
# Secrets Module - Variables
# =============================================================================

variable "name_prefix" {
  description = "Prefix for resource names."
  type        = string
}

variable "database_url" {
  description = "PostgreSQL connection URL."
  type        = string
  sensitive   = true
}

variable "jwt_issuer" {
  description = "JWT issuer claim."
  type        = string
  default     = "portals-cloud"
}

variable "jwt_audience" {
  description = "JWT audience claims."
  type        = list(string)
  default     = ["lore-server"]
}

variable "jwt_kid" {
  description = "JWT key ID (optional — auto-generated if empty)."
  type        = string
  default     = ""
}

variable "aws_region" {
  description = "AWS region for Lore S3/DynamoDB access."
  type        = string
  default     = "us-east-1"
}

variable "aws_access_key_id" {
  description = "AWS access key ID for Lore (optional — use IAM roles instead)."
  type        = string
  sensitive   = true
  default     = ""
}

variable "aws_secret_access_key" {
  description = "AWS secret access key for Lore (optional — use IAM roles instead)."
  type        = string
  sensitive   = true
  default     = ""
}

variable "tags" {
  description = "Resource tags."
  type        = map(string)
  default     = {}
}
