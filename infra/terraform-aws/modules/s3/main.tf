# =============================================================================
# S3 Module — Lore Immutable Fragment Store
# =============================================================================
#
# Content-addressed fragment payloads for Lore's AwsImmutableStore.
# Server-side encryption (SSE-S3) is always on. All public access is blocked.
#
# =============================================================================

resource "aws_s3_bucket" "fragments" {
  bucket        = var.bucket_name
  force_destroy = var.force_destroy

  tags = merge(var.tags, {
    Name        = var.bucket_name
    Environment = var.environment
  })
}

resource "aws_s3_bucket_versioning" "fragments" {
  bucket = aws_s3_bucket.fragments.id

  versioning_configuration {
    status = "Disabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "fragments" {
  bucket = aws_s3_bucket.fragments.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "fragments" {
  bucket = aws_s3_bucket.fragments.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "fragments" {
  bucket = aws_s3_bucket.fragments.id

  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"

    filter {
      prefix = ""
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}
