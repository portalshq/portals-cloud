# =============================================================================
# Lore Module — Lore Server ECS Service
# =============================================================================
#
# Deploys portalshq/lore-server as an ECS Fargate service with:
#   - EFS volume for persistent storage (mutable store, locks, certs)
#   - S3 + DynamoDB for immutable fragment store
#   - ALB attachment for HTTP (port 41339)
#   - NLB attachment for QUIC/gRPC (port 41337 TCP+UDP)
#   - JWKS sidecar container for JWT validation
#
# =============================================================================

# ---------------------------------------------------------------------------
# Security Group — Lore ECS tasks
# ---------------------------------------------------------------------------
resource "aws_security_group" "lore" {
  name_prefix = "${var.environment}-portals-cloud-lore-"
  description = "Allow traffic from ALB/NLB to Lore ECS tasks"
  vpc_id      = var.vpc_id

  ingress {
    description     = "HTTP from ALB"
    from_port       = 41339
    to_port         = 41339
    protocol        = "tcp"
    security_groups = [var.alb_security_group_id]
  }

  ingress {
    description     = "TCP from NLB"
    from_port       = 41337
    to_port         = 41337
    protocol        = "tcp"
    security_groups = [var.nlb_security_group_id]
  }

  ingress {
    description     = "UDP from NLB"
    from_port       = 41337
    to_port         = 41337
    protocol        = "udp"
    security_groups = [var.nlb_security_group_id]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description     = "NFS to EFS"
    from_port       = 2049
    to_port         = 2049
    protocol        = "tcp"
    security_groups = [var.efs_security_group_id]
  }

  tags = merge(var.tags, {
    Name = "${var.environment}-portals-cloud-lore-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# ---------------------------------------------------------------------------
# Task Definition
# ---------------------------------------------------------------------------
resource "aws_ecs_task_definition" "lore" {
  family                   = "${var.environment}-lore-server"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.lore_execution.arn
  task_role_arn            = aws_iam_role.lore_task.arn

  volume {
    name = "lore-data"

    efs_volume_configuration {
      file_system_id     = var.efs_file_system_id
      root_directory     = "/"
      transit_encryption = "ENABLED"
      authorization_config {
        access_point_id = var.efs_access_point_id
        iam             = "DISABLED"
      }
    }
  }

  container_definitions = jsonencode([
    {
      name      = "lore-server"
      image     = "${var.ecr_repository_url}:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = 41337
          protocol      = "tcp"
        },
        {
          containerPort = 41337
          protocol      = "udp"
        },
        {
          containerPort = 41339
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "LORE_CONFIG_PATH"
          value = "/etc/lore/config"
        },
        {
          name  = "LORE_ENV"
          value = "prod"
        },
        {
          name  = "RUST_LOG"
          value = "info"
        },
        {
          name  = "AWS_DEFAULT_REGION"
          value = var.region
        },
        {
          name  = "LORE__PLUGINS__AWS__IMMUTABLE_STORE__S3_BUCKET"
          value = var.s3_bucket_name
        },
        {
          name  = "LORE__PLUGINS__AWS__IMMUTABLE_STORE__S3_REGION"
          value = var.region
        },
        {
          name  = "LORE__PLUGINS__AWS__IMMUTABLE_STORE__DYNAMODB_FRAGMENTS_TABLE"
          value = var.dynamodb_fragments_table_name
        },
        {
          name  = "LORE__PLUGINS__AWS__IMMUTABLE_STORE__DYNAMODB_METADATA_TABLE"
          value = var.dynamodb_metadata_table_name
        },
        {
          name  = "LORE__PLUGINS__AWS__IMMUTABLE_STORE__DYNAMODB_REGION"
          value = var.region
        },
        {
          name  = "LORE__SERVER__AUTH__JWK__ENDPOINT"
          value = "http://127.0.0.1:8080/jwks.json"
        },
        {
          name  = "LORE__SERVER__AUTH__JWT_ISSUER"
          value = var.jwt_issuer
        },
        {
          name  = "LORE__SERVER__AUTH__JWT_AUDIENCE"
          value = jsonencode(var.jwt_audience)
        }
      ]

      secrets = [
        {
          name      = "LORE__SERVER__HTTP__PRESIGNED_URL_HMAC_KEY"
          valueFrom = var.secrets_arns["hmac-key"]
        }
      ]

      mountPoints = [
        {
          sourceVolume  = "lore-data"
          containerPath = "/data"
          readOnly      = false
        }
      ]

      # Entrypoint script to generate self-signed cert if missing
      entryPoint = ["/bin/sh", "-c"]
      command = [
        <<-EOT
          if [ ! -f /data/certs/cert.pem ]; then
            echo "Generating self-signed TLS certificate..."
            mkdir -p /data/certs
            openssl req -x509 -newkey rsa:2048 -keyout /data/certs/key.pem -out /data/certs/cert.pem \
              -days 365 -nodes -subj "/CN=localhost"
            echo "Certificate generated at /data/certs/"
          fi
          exec /usr/local/bin/loreserver
        EOT
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = var.cloudwatch_log_group_name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "lore"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:41339/health_check || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }

    },
    # JWKS sidecar container
    {
      name      = "jwks-sidecar"
      image     = "python:3.11-slim"
      essential = false

      portMappings = [
        {
          containerPort = 8080
          protocol      = "tcp"
        }
      ]

      # Write JWKS via base64 to avoid shell quoting issues
      entryPoint = ["/bin/sh", "-c"]
      command = [
        <<-EOT
          echo "${base64encode(var.jwks_content)}" | base64 -d > /jwks.json
          cd / && python3 -m http.server 8080
        EOT
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = var.cloudwatch_log_group_name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "jwks-sidecar"
        }
      }
    }
  ])
}

# ---------------------------------------------------------------------------
# ECS Service
# ---------------------------------------------------------------------------
resource "aws_ecs_service" "lore" {
  name            = "${var.environment}-lore-server"
  cluster         = var.cluster_id
  task_definition = aws_ecs_task_definition.lore.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  platform_version = "1.4.0"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.lore.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.alb_target_group_arn
    container_name   = "lore-server"
    container_port   = 41339
  }

  load_balancer {
    target_group_arn = var.nlb_target_group_tcp_arn
    container_name   = "lore-server"
    container_port   = 41337
  }

  load_balancer {
    target_group_arn = var.nlb_target_group_udp_arn
    container_name   = "lore-server"
    container_port   = 41337
  }

  tags = merge(var.tags, {
    Name = "${var.environment}-portals-cloud-lore-service"
  })

  depends_on = [
    aws_iam_role.lore_execution,
    aws_iam_role.lore_task
  ]
}
