# =============================================================================
# CloudWatch Module — ECS Service Log Groups
# =============================================================================
#
# Dedicated log groups for Lore Server, Server API, and Frontend.
# ECS tasks use the awslogs log driver to ship container logs here.
#
# =============================================================================

resource "aws_cloudwatch_log_group" "lore_server" {
  name              = "/portals-cloud/${var.environment}/lore-server"
  retention_in_days = var.log_retention_days

  tags = merge(var.tags, {
    Name        = "lore-server"
    Environment = var.environment
    Service     = "lore"
  })
}

resource "aws_cloudwatch_log_group" "server" {
  name              = "/portals-cloud/${var.environment}/server"
  retention_in_days = var.log_retention_days

  tags = merge(var.tags, {
    Name        = "server"
    Environment = var.environment
    Service     = "server"
  })
}

resource "aws_cloudwatch_log_group" "frontend" {
  name              = "/portals-cloud/${var.environment}/frontend"
  retention_in_days = var.log_retention_days

  tags = merge(var.tags, {
    Name        = "frontend"
    Environment = var.environment
    Service     = "frontend"
  })
}
