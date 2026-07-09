variable "environment" {
  description = "Deployment environment name."
  type        = string
}

variable "repository_names" {
  description = "List of ECR repository names to create."
  type        = list(string)
}

variable "force_delete" {
  description = "Allow deletion of non-empty repositories."
  type        = bool
  default     = false
}

variable "untagged_image_expiry_days" {
  description = "Number of days after which untagged images are expired."
  type        = number
  default     = 7
}

variable "max_tagged_image_count" {
  description = "Maximum number of tagged images to keep per repository."
  type        = number
  default     = 10
}

variable "tags" {
  description = "Additional tags to apply to all resources."
  type        = map(string)
  default     = {}
}
