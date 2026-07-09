# =============================================================================
# Frontend Module — nginx SPA ECS Service
# =============================================================================
#
# Deploys the portals-cloud frontend (Vite React SPA) as an ECS Fargate
# service using nginx to serve the built static assets.
#
# The frontend Docker image should contain the built vite output in
# /usr/share/nginx/html, with an nginx configuration that proxies /api/*
# requests to the ALB's server target group (via the server FQDN or
# directly if co-located).
#
# ALB routing: /* -> Frontend (port 80)
#              /api/* -> Server API (via ALB listener rules)
#
# =============================================================================

# ---------------------------------------------------------------------------
# Security Group — Frontend ECS tasks
# ---------------------------------------------------------------------------
resource "aws_security_group" "frontend" {
  name_prefix = "${var.environment}-portals-cloud-frontend-"
  description = "Allow traffic from ALB to Frontend ECS tasks"
  vpc_id      = var.vpc_id

  ingress {
    description     = "HTTP from ALB"
    from_port       = 80
    to_port         = 80
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
    Name = "${var.environment}-portals-cloud-frontend-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# ---------------------------------------------------------------------------
# Task Definition
# ---------------------------------------------------------------------------
resource "aws_ecs_task_definition" "frontend" {
  family                   = "${var.environment}-frontend"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.frontend_execution.arn

  container_definitions = jsonencode([
    {
      name      = "frontend"
      image     = "${var.ecr_repository_url}:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = 80
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "VITE_API_BASE_URL"
          value = var.api_base_url
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = var.cloudwatch_log_group_name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "frontend"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 30
      }
    }
  ])
}

# ---------------------------------------------------------------------------
# ECS Service
# ---------------------------------------------------------------------------
resource "aws_ecs_service" "frontend" {
  name            = "${var.environment}-frontend"
  cluster         = var.cluster_id
  task_definition = aws_ecs_task_definition.frontend.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.frontend.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.alb_target_group_arn
    container_name   = "frontend"
    container_port   = 80
  }

  tags = merge(var.tags, {
    Name = "${var.environment}-portals-cloud-frontend-service"
  })

  depends_on = [
    aws_iam_role.frontend_execution
  ]
}
