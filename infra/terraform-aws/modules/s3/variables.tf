variable "environment" {
  description = "Deployment environment name."
  type        = string
}

variable "bucket_name" {
  description = "Name of the S3 bucket."
  type        = string
}

variable "force_destroy" {
  description = "Allow deletion of non-empty bucket."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Additional tags to apply to all resources."
  type        = map(string)
  default     = {}
}
