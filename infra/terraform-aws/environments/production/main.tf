# =============================================================================
# Production Environment — Root Module
# =============================================================================
#
# Composes all infrastructure modules for portals-cloud production
# deployment on AWS ECS Fargate. Deploys:
#
#   Services:
#     - Frontend  (Vite/React SPA via nginx, port 80)
#     - Server    (Express API, port 8899)
#     - Lore      (portalshq/lore-server, ports 41337/41339)
#
#   Infrastructure:
#     VPC, RDS (PostgreSQL), S3, DynamoDB, EFS, Secrets Manager, ECR,
#     ALB, NLB, ACM/Route53, ECS (Fargate), CloudWatch Logs.
#
# Architecture:
#   ALB handles HTTP/S traffic, routing /api/* and /healthz → Server,
#   /ws/* and /lore/* → Lore, and /* → Frontend.
#   NLB handles QUIC/UDP + gRPC/TCP → Lore on port 41337.
#
# =============================================================================

provider "aws" {
  region = var.aws_region
}

locals {
  name_prefix   = "${var.environment}-portals-cloud"
  domain_active = var.domain_name != "" && var.hosted_zone_id != ""
}

# =============================================================================
# PHASE 1: Foundational Infrastructure (no dependencies — parallel)
# =============================================================================

module "vpc" {
  source = "../../modules/vpc"

  environment        = var.environment
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones
  tags               = var.tags
}

module "rds" {
  source = "../../modules/rds"

  name_prefix                = local.name_prefix
  vpc_id                     = module.vpc.vpc_id
  private_subnet_ids         = module.vpc.private_subnet_ids
  allowed_security_group_ids = []  # SGs added in PHASE 4 via security_group_rule
  instance_class             = var.rds_instance_class
  allocated_storage          = var.rds_allocated_storage
  db_name                    = var.rds_db_name
  db_username                = var.rds_db_username
  backup_retention_days      = var.rds_backup_retention_days
  skip_final_snapshot        = var.rds_skip_final_snapshot
  deletion_protection        = var.rds_deletion_protection
  performance_insights_enabled = var.rds_performance_insights_enabled
  tags                       = var.tags
}

module "s3" {
  source = "../../modules/s3"

  environment  = var.environment
  bucket_name  = var.s3_bucket_name
  force_destroy = false
  tags         = var.tags
}

module "dynamodb" {
  source = "../../modules/dynamodb"

  environment                   = var.environment
  fragments_table_name          = var.dynamodb_fragments_table_name
  metadata_table_name           = var.dynamodb_metadata_table_name
  enable_point_in_time_recovery = true
  tags                          = var.tags
}

module "efs" {
  source = "../../modules/efs"

  environment        = var.environment
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
  tags               = var.tags
}

module "ecr" {
  source = "../../modules/ecr"

  environment                = var.environment
  repository_names           = var.ecr_repository_names
  force_delete               = false
  untagged_image_expiry_days = 7
  max_tagged_image_count     = 10
  tags                       = var.tags
}

module "cloudwatch" {
  source = "../../modules/cloudwatch"

  environment        = var.environment
  log_retention_days = var.log_retention_days
  tags               = var.tags
}

module "ecs" {
  source = "../../modules/ecs"

  environment  = var.environment
  cluster_name = "${local.name_prefix}-cluster"
  tags         = var.tags
}

# =============================================================================
# PHASE 2: Certificate & Secrets
# =============================================================================

# ACM certificate + DNS validation (no dependency on ALB/NLB)
module "route53_cert" {
  source = "../../modules/route53"

  name_prefix    = local.name_prefix
  domain_name    = var.domain_name
  hosted_zone_id = var.hosted_zone_id
  tags           = var.tags
}

# Secrets (depends on RDS for database URL)
module "secrets" {
  source = "../../modules/secrets"

  name_prefix  = local.name_prefix
  database_url = module.rds.connection_url
  jwt_issuer   = var.jwt_issuer
  jwt_audience = var.jwt_audience
  aws_region   = var.aws_region
  tags         = var.tags
}

# =============================================================================
# PHASE 3: Load Balancers
# =============================================================================

module "alb" {
  source = "../../modules/alb"

  name_prefix          = local.name_prefix
  vpc_id               = module.vpc.vpc_id
  public_subnet_ids    = module.vpc.public_subnet_ids
  certificate_arn      = module.route53_cert.certificate_arn
  lore_container_port  = 41339  # Lore HTTP port (matches lore service container_port)
  server_container_port = 8899  # Explicit to make dependency clear
  frontend_container_port = 80  # Explicit to make dependency clear
  tags                 = var.tags
}

module "nlb" {
  source = "../../modules/nlb"

  name_prefix       = local.name_prefix
  vpc_id            = module.vpc.vpc_id
  public_subnet_ids = module.vpc.public_subnet_ids
  tags              = var.tags
}

# =============================================================================
# PHASE 4: ECS Services
# =============================================================================

module "frontend" {
  source = "../../modules/frontend"

  cluster_id             = module.ecs.cluster_id
  ecr_repository_url     = module.ecr.repository_urls["portals-cloud/frontend"]
  image_tag              = var.frontend_image_tag
  vpc_id                 = module.vpc.vpc_id
  private_subnet_ids     = module.vpc.private_subnet_ids
  alb_target_group_arn   = module.alb.frontend_target_group_arn
  alb_security_group_id  = module.alb.security_group_id
  api_base_url           = var.frontend_api_base_url
  cpu                    = var.frontend_cpu
  memory                 = var.frontend_memory
  desired_count          = var.frontend_desired_count
  environment            = var.environment
  region                 = var.aws_region
  cloudwatch_log_group_name = module.cloudwatch.frontend_log_group_name
  tags                   = var.tags
}

module "server" {
  source = "../../modules/server"

  cluster_id              = module.ecs.cluster_id
  ecr_repository_url      = module.ecr.repository_urls["portals-cloud/server"]
  image_tag               = var.server_image_tag
  vpc_id                  = module.vpc.vpc_id
  private_subnet_ids      = module.vpc.private_subnet_ids
  alb_target_group_arn    = module.alb.server_target_group_arn
  alb_security_group_id   = module.alb.security_group_id
  database_url_secret_arn = module.secrets.database_url_arn
  app_secrets_arn         = module.secrets.app_secrets_arn
  lore_server_url         = "http://${module.nlb.nlb_dns_name}:41337"
  lore_grpc_host          = "${module.nlb.nlb_dns_name}:41337"
  lore_quic_host          = "${module.nlb.nlb_dns_name}:41337"
  cpu                     = var.server_cpu
  memory                  = var.server_memory
  desired_count           = var.server_desired_count
  environment             = var.environment
  region                  = var.aws_region
  cloudwatch_log_group_name = module.cloudwatch.server_log_group_name
  tags                    = var.tags
}

module "lore" {
  source = "../../modules/lore"

  cluster_id              = module.ecs.cluster_id
  cluster_name            = module.ecs.cluster_name
  ecr_repository_url      = module.ecr.repository_urls["portals-cloud/lore-server"]
  image_tag               = var.lore_image_tag
  vpc_id                  = module.vpc.vpc_id
  private_subnet_ids      = module.vpc.private_subnet_ids
  efs_file_system_id      = module.efs.file_system_id
  efs_access_point_id     = module.efs.access_point_id
  s3_bucket_name          = module.s3.bucket_name
  s3_bucket_arn           = module.s3.bucket_arn
  dynamodb_fragments_table_name = module.dynamodb.fragments_table_name
  dynamodb_fragments_table_arn  = module.dynamodb.fragments_table_arn
  dynamodb_metadata_table_name  = module.dynamodb.metadata_table_name
  dynamodb_metadata_table_arn   = module.dynamodb.metadata_table_arn
  secrets_arns = {
    "hmac-key" = module.secrets.hmac_key_arn
    "jwks"     = module.secrets.jwks_arn
  }
  jwks_content             = module.secrets.jwks_content
  jwt_issuer               = var.jwt_issuer
  jwt_audience             = var.jwt_audience
  alb_target_group_arn     = module.alb.lore_target_group_arn
  nlb_target_group_tcp_arn = module.nlb.lore_tcp_target_group_arn
  nlb_target_group_udp_arn = module.nlb.lore_udp_target_group_arn
  alb_security_group_id    = module.alb.security_group_id
  nlb_security_group_id    = module.nlb.security_group_id
  efs_security_group_id    = module.efs.security_group_id
  cpu                      = var.lore_cpu
  memory                   = var.lore_memory
  desired_count            = var.lore_desired_count
  environment              = var.environment
  region                   = var.aws_region
  cloudwatch_log_group_name = module.cloudwatch.lore_log_group_name
  tags                     = var.tags
}

# Add RDS ingress rules from ECS service security groups
resource "aws_security_group_rule" "rds_server_ingress" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = module.server.security_group_id
  security_group_id        = module.rds.security_group_id
}

resource "aws_security_group_rule" "rds_lore_ingress" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = module.lore.security_group_id
  security_group_id        = module.rds.security_group_id
}

# =============================================================================
# PHASE 5: Route53 DNS Records (after ALB/NLB DNS names are known)
# =============================================================================

resource "aws_route53_record" "app" {
  count = local.domain_active ? 1 : 0

  zone_id = var.hosted_zone_id
  name    = "app.${var.domain_name}"
  type    = "A"

  alias {
    name                   = module.alb.alb_dns_name
    zone_id                = module.alb.alb_zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "lore" {
  count = local.domain_active ? 1 : 0

  zone_id = var.hosted_zone_id
  name    = "lore.${var.domain_name}"
  type    = "A"

  alias {
    name                   = module.nlb.nlb_dns_name
    zone_id                = module.nlb.nlb_zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "root" {
  count = local.domain_active ? 1 : 0

  zone_id = var.hosted_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = module.alb.alb_dns_name
    zone_id                = module.alb.alb_zone_id
    evaluate_target_health = true
  }
}

# =============================================================================
# Data sources
# =============================================================================

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
