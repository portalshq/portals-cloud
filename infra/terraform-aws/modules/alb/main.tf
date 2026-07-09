# =============================================================================
# Application Load Balancer Module
# =============================================================================

locals {
  # Include default HTTPS listener only if a certificate is provided
  https_listener_enabled = var.certificate_arn != ""
}

# ---------------------------------------------------------------------------
# Security Group
# ---------------------------------------------------------------------------
resource "aws_security_group" "alb" {
  name        = "${var.name_prefix}-alb"
  description = "ALB security group"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTP from internet"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  dynamic "ingress" {
    for_each = local.https_listener_enabled ? ["https"] : []
    content {
      description = "HTTPS from internet"
      from_port   = 443
      to_port     = 443
      protocol    = "tcp"
      cidr_blocks = ["0.0.0.0/0"]
    }
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = var.tags
}

# ---------------------------------------------------------------------------
# ALB
# ---------------------------------------------------------------------------
resource "aws_lb" "this" {
  name               = "${var.name_prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids

  enable_deletion_protection = var.enable_deletion_protection
  idle_timeout               = 60

  tags = var.tags
}

# ---------------------------------------------------------------------------
# HTTP Listener (always present — redirects to HTTPS if cert exists)
# ---------------------------------------------------------------------------
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = local.https_listener_enabled ? "redirect" : "fixed-response"

    dynamic "redirect" {
      for_each = local.https_listener_enabled ? ["redirect"] : []
      content {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }

    dynamic "fixed_response" {
      for_each = local.https_listener_enabled ? [] : ["fixed"]
      content {
        content_type = "text/plain"
        message_body = "OK"
        status_code  = "200"
      }
    }
  }

  tags = var.tags
}

# ---------------------------------------------------------------------------
# HTTPS Listener (conditional — created only when cert is provided)
# ---------------------------------------------------------------------------
resource "aws_lb_listener" "https" {
  count             = local.https_listener_enabled ? 1 : 0
  load_balancer_arn = aws_lb.this.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "OK"
      status_code  = "200"
    }
  }

  tags = var.tags
}

# ---------------------------------------------------------------------------
# Target Groups
# ---------------------------------------------------------------------------

# Lore — gRPC/WebSocket traffic
resource "aws_lb_target_group" "lore" {
  name        = "${var.name_prefix}-lore-tg"
  port        = var.lore_container_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/healthz"
    port                = var.lore_container_port
    protocol            = "HTTP"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200-499"
  }

  tags = var.tags
}

# Server — REST API
resource "aws_lb_target_group" "server" {
  name        = "${var.name_prefix}-server-tg"
  port        = var.server_container_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/api/healthz"
    port                = var.server_container_port
    protocol            = "HTTP"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200-499"
  }

  tags = var.tags
}

# Frontend — SPA
resource "aws_lb_target_group" "frontend" {
  name        = "${var.name_prefix}-frontend-tg"
  port        = var.frontend_container_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/"
    port                = var.frontend_container_port
    protocol            = "HTTP"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200-399"
  }

  tags = var.tags
}

# ---------------------------------------------------------------------------
# Listener Rules
# ---------------------------------------------------------------------------

# Route /api/* → Server
resource "aws_lb_listener_rule" "server_api" {
  listener_arn = local.https_listener_enabled ? aws_lb_listener.https[0].arn : aws_lb_listener.http.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.server.arn
  }

  condition {
    path_pattern {
      values = ["/api/*"]
    }
  }

  tags = var.tags
}

# Route /healthz → Server
resource "aws_lb_listener_rule" "server_healthz" {
  listener_arn = local.https_listener_enabled ? aws_lb_listener.https[0].arn : aws_lb_listener.http.arn
  priority     = 20

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.server.arn
  }

  condition {
    path_pattern {
      values = ["/healthz"]
    }
  }

  tags = var.tags
}

# Route /ws/* → Lore (WebSocket)
resource "aws_lb_listener_rule" "lore_ws" {
  listener_arn = local.https_listener_enabled ? aws_lb_listener.https[0].arn : aws_lb_listener.http.arn
  priority     = 30

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.lore.arn
  }

  condition {
    path_pattern {
      values = ["/ws/*"]
    }
  }

  tags = var.tags
}

# Route /lore/* → Lore (HTTP proxy)
resource "aws_lb_listener_rule" "lore_http" {
  listener_arn = local.https_listener_enabled ? aws_lb_listener.https[0].arn : aws_lb_listener.http.arn
  priority     = 40

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.lore.arn
  }

  condition {
    path_pattern {
      values = ["/lore/*"]
    }
  }

  tags = var.tags
}

# Default: everything else → Frontend
resource "aws_lb_listener_rule" "frontend_default" {
  listener_arn = local.https_listener_enabled ? aws_lb_listener.https[0].arn : aws_lb_listener.http.arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.frontend.arn
  }

  condition {
    path_pattern {
      values = ["/*"]
    }
  }

  tags = var.tags
}
