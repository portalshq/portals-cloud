# =============================================================================
# Frontend Module IAM Roles
# =============================================================================

# ---------------------------------------------------------------------------
# Execution Role
# ---------------------------------------------------------------------------
resource "aws_iam_role" "frontend_execution" {
  name_prefix        = "${var.environment}-portals-cloud-frontend-exec-"
  assume_role_policy = data.aws_iam_policy_document.assume_role_ecs.json

  tags = merge(var.tags, {
    Name = "${var.environment}-portals-cloud-frontend-execution-role"
  })
}

data "aws_iam_policy_document" "assume_role_ecs" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy_attachment" "frontend_execution_ecs" {
  role       = aws_iam_role.frontend_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "frontend_execution_ecr" {
  name = "ecr-access"
  role = aws_iam_role.frontend_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy" "frontend_execution_logs" {
  name = "cloudwatch-logs"
  role = aws_iam_role.frontend_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:${var.region}:*:log-group:${var.cloudwatch_log_group_name}:*"
      }
    ]
  })
}
