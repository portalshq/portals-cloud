terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
    tls    = { source = "hashicorp/tls", version = "~> 4.0" }
  }

  # Uncomment and configure for remote state storage:
  # backend "s3" {
  #   bucket = "portals-cloud-terraform-state"
  #   key    = "portals-cloud/production/terraform.tfstate"
  #   region = "us-east-1"
  #   encrypt = true
  # }
}
