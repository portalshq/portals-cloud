# =============================================================================
# Lore Module IAM Roles
# =============================================================================

# ---------------------------------------------------------------------------
# Execution Role
# ---------------------------------------------------------------------------
resource "aws_iam_role" "lore_execution" {
  name_prefix        = "${var.environment}-portals-cloud-lore-exec-"
  assume_role_policy = data.aws_iam_policy_document.assume_role_ecs.json

  tags = merge(var.tags, {
    Name = "${var.environment}-portals-cloud-lore-execution-role"
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

resource "aws_iam_role_policy_attachment" "lore_execution_ecs" {
  role       = aws_iam_role.lore_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "lore_execution_secrets" {
  name = "secrets-manager-access"
  role = aws_iam_role.lore_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue"]
        Resource = [
          var.secrets_arns["hmac-key"],
          var.secrets_arns["jwks"]
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "lore_execution_ecr" {
  name = "ecr-access"
  role = aws_iam_role.lore_execution.id

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

resource "aws_iam_role_policy" "lore_execution_logs" {
  name = "cloudwatch-logs"
  role = aws_iam_role.lore_execution.id

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

# ---------------------------------------------------------------------------
# Task Role
# ---------------------------------------------------------------------------
resource "aws_iam_role" "lore_task" {
  name_prefix        = "${var.environment}-portals-cloud-lore-task-"
  assume_role_policy = data.aws_iam_policy_document.assume_role_ecs.json

  tags = merge(var.tags, {
    Name = "${var.environment}-portals-cloud-lore-task-role"
  })
}

resource "aws_iam_role_policy" "lore_task_s3" {
  name = "s3-fragments-access"
  role = aws_iam_role.lore_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "${var.s3_bucket_arn}/*"
      },
      {
        Effect = "Allow"
        Action = ["s3:ListBucket"]
        Resource = var.s3_bucket_arn
      }
    ]
  })
}

resource "aws_iam_role_policy" "lore_task_dynamodb" {
  name = "dynamodb-fragments-access"
  role = aws_iam_role.lore_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem"
        ]
        Resource = [
          var.dynamodb_fragments_table_arn,
          "${var.dynamodb_fragments_table_arn}/index/*",
          var.dynamodb_metadata_table_arn
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "lore_task_secrets" {
  name = "secrets-manager-access"
  role = aws_iam_role.lore_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue"]
        Resource = [
          var.secrets_arns["hmac-key"],
          var.secrets_arns["jwks"]
        ]
      }
    ]
  })
}
