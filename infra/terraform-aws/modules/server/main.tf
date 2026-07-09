locals {
  secrets_list = var.app_secrets_arn != "" ? [
    { name = "PORTALS_DATABASE_URL", valueFrom = var.database_url_secret_arn },
    { name = "APP_SECRETS",         valueFrom = var.app_secrets_arn }
  ] : [
    { name = "PORTALS_DATABASE_URL", valueFrom = var.database_url_secret_arn }
  ]
}

# =============================================================================
# Server Module — Express API ECS Service
# =============================================================================
#
# Deploys the portals-cloud Express API as an ECS Fargate service with:
#   - ALB attachment for HTTP (port 8899)
#   - Secrets Manager integration for DATABASE_URL + app secrets
#   - Health check endpoint
#   - Lore connection endpoints (configurable for NLB/ALB)
#
# =============================================================================

# ---------------------------------------------------------------------------
# Security Group — Server ECS tasks
# ---------------------------------------------------------------------------
resource "aws_security_group" "server" {
  name_prefix = "${var.environment}-portals-cloud-server-"
  description = "Allow traffic from ALB to Server ECS tasks"
  vpc_id      = var.vpc_id

  ingress {
    description     = "HTTP from ALB"
    from_port       = 8899
    to_port         = 8899
    protocol        = "tcp"
    security_groups = [var.alb_security_group_id]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.environment}-portals-cloud-server-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# ---------------------------------------------------------------------------
# Task Definition
# ---------------------------------------------------------------------------
resource "aws_ecs_task_definition" "server" {
  family                   = "${var.environment}-server-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.server_execution.arn
  task_role_arn            = aws_iam_role.server_task.arn

  container_definitions = jsonencode([
    {
      name      = "server"
      image     = "${var.ecr_repository_url}:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = 8899
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "PORT"
          value = "8899"
        },
        {
          name  = "NODE_ENV"
          value = "production"
        },
        {
          name  = "LORE_SERVER_URL"
          value = var.lore_server_url
        },
        {
          name  = "LORE_GRPC_HOST"
          value = var.lore_grpc_host
        },
        {
          name  = "LORE_QUIC_HOST"
          value = var.lore_quic_host
        },
        {
          name  = "AWS_DEFAULT_REGION"
          value = var.region
        }
      ]

      secrets = local.secrets_list

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = var.cloudwatch_log_group_name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "server"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:8899/api/healthz || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }

    }
  ])
}

# ---------------------------------------------------------------------------
# ECS Service
# ---------------------------------------------------------------------------
resource "aws_ecs_service" "server" {
  name            = "${var.environment}-server-api"
  cluster         = var.cluster_id
  task_definition = aws_ecs_task_definition.server.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.server.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.alb_target_group_arn
    container_name   = "server"
    container_port   = 8899
  }

  tags = merge(var.tags, {
    Name = "${var.environment}-portals-cloud-server-service"
  })

  depends_on = [
    aws_iam_role.server_execution,
    aws_iam_role.server_task
  ]
}
