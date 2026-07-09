# =============================================================================
# Route53 Module - Variables
# =============================================================================

variable "name_prefix" {
  description = "Prefix for resource names."
  type        = string
}

variable "domain_name" {
  description = "Domain name (e.g., portals.example.com)."
  type        = string
  default     = ""
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone ID."
  type        = string
  default     = ""
}

variable "tags" {
  description = "Resource tags."
  type        = map(string)
  default     = {}
}
