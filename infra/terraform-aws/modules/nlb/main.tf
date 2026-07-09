# =============================================================================
# Network Load Balancer Module
# =============================================================================

# Security group for NLB
resource "aws_security_group" "nlb" {
  name        = "${var.name_prefix}-nlb"
  description = "NLB security group"
  vpc_id      = var.vpc_id

  ingress {
    description = "Lore QUIC/UDP"
    from_port   = var.lore_nlb_port
    to_port     = var.lore_nlb_port
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Lore gRPC/TCP"
    from_port   = var.lore_nlb_port
    to_port     = var.lore_nlb_port
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
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
# NLB
# ---------------------------------------------------------------------------
resource "aws_lb" "nlb" {
  name               = "${var.name_prefix}-nlb"
  internal           = false
  load_balancer_type = "network"
  subnets            = var.public_subnet_ids

  enable_deletion_protection = var.enable_deletion_protection

  tags = var.tags
}

# ---------------------------------------------------------------------------
# TCP Listener (gRPC)
# ---------------------------------------------------------------------------
resource "aws_lb_listener" "tcp" {
  load_balancer_arn = aws_lb.nlb.arn
  port              = var.lore_nlb_port
  protocol          = "TCP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.lore_tcp.arn
  }

  tags = var.tags
}

# ---------------------------------------------------------------------------
# UDP Listener (QUIC)
# ---------------------------------------------------------------------------
resource "aws_lb_listener" "udp" {
  load_balancer_arn = aws_lb.nlb.arn
  port              = var.lore_nlb_port
  protocol          = "UDP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.lore_udp.arn
  }

  tags = var.tags
}

# ---------------------------------------------------------------------------
# TCP Target Group (gRPC)
# ---------------------------------------------------------------------------
resource "aws_lb_target_group" "lore_tcp" {
  name        = "${var.name_prefix}-lore-tcp-tg"
  port        = var.lore_container_port
  protocol    = "TCP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    protocol            = "TCP"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
  }

  tags = var.tags
}

# ---------------------------------------------------------------------------
# UDP Target Group (QUIC)
# ---------------------------------------------------------------------------
resource "aws_lb_target_group" "lore_udp" {
  name        = "${var.name_prefix}-lore-udp-tg"
  port        = var.lore_container_port
  protocol    = "UDP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    protocol            = "TCP"  # UDP health checks not supported; use TCP
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
  }

  tags = var.tags
}
