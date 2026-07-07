variable "linode_token" {
  type        = string
  sensitive   = true
  description = "Linode API token. Set via TF_VAR_linode_token or a tfvars file that is gitignored."
}

variable "region" {
  type    = string
  default = "us-east" # adjust to nearest region to majority audience base
}

variable "environment" {
  type    = string
  default = "staging"
}

variable "lke_node_count" {
  type    = number
  default = 3
}

variable "lke_node_type" {
  type    = string
  default = "g6-standard-4" # 4 vCPU / 8GB — starting point, size against real load test
}
