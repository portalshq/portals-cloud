# =============================================================================
# NLB Module - Variables
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

variable "lore_container_port" {
  description = "Lore container port (internal)."
  type        = number
  default     = 41337
}

variable "lore_nlb_port" {
  description = "NLB port to forward to Lore."
  type        = number
  default     = 41337
}

variable "enable_deletion_protection" {
  description = "Enable NLB deletion protection."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Resource tags."
  type        = map(string)
  default     = {}
}
