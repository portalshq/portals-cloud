variable "environment" {
  description = "Deployment environment name."
  type        = string
}

variable "fragments_table_name" {
  description = "Name of the fragments index table."
  type        = string
}

variable "metadata_table_name" {
  description = "Name of the metadata table."
  type        = string
}

variable "enable_point_in_time_recovery" {
  description = "Enable point-in-time recovery for DynamoDB tables."
  type        = bool
  default     = true
}

variable "tags" {
  description = "Additional tags to apply to all resources."
  type        = map(string)
  default     = {}
}
