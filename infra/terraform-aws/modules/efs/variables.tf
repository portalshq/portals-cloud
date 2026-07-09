variable "environment" {
  description = "Deployment environment name."
  type        = string
}

variable "vpc_id" {
  description = "ID of the VPC."
  type        = string
}

variable "private_subnet_ids" {
  description = "IDs of the private subnets for EFS mount targets."
  type        = list(string)
}


variable "tags" {
  description = "Additional tags to apply to all resources."
  type        = map(string)
  default     = {}
}
