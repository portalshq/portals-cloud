# =============================================================================
# DynamoDB Module — Lore Fragment Index and Metadata Tables
# =============================================================================
#
# Two tables required by the lore-aws plugin's AwsImmutableStore:
# 1. Fragment Index — hash (B, PK) + repository_context (B, SK)
# 2. Fragment Metadata — hash (B, PK)
#
# =============================================================================

resource "aws_dynamodb_table" "fragments" {
  name         = var.fragments_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "hash"
  range_key    = "repository_context"

  attribute {
    name = "hash"
    type = "B"
  }

  attribute {
    name = "repository_context"
    type = "B"
  }

  point_in_time_recovery {
    enabled = var.enable_point_in_time_recovery
  }

  server_side_encryption {
    enabled = true
  }

  tags = merge(var.tags, {
    Name        = var.fragments_table_name
    Environment = var.environment
  })
}

resource "aws_dynamodb_table" "metadata" {
  name         = var.metadata_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "hash"

  attribute {
    name = "hash"
    type = "B"
  }

  point_in_time_recovery {
    enabled = var.enable_point_in_time_recovery
  }

  server_side_encryption {
    enabled = true
  }

  tags = merge(var.tags, {
    Name        = var.metadata_table_name
    Environment = var.environment
  })
}
