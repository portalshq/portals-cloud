# =============================================================================
# Route53 Module — ACM Certificate Provisioning Only
# =============================================================================
#
# NOTE: A records pointing to the ALB and NLB are created in the root main.tf
# to avoid circular dependencies (cert → ALB → DNS records).
#

locals {
  enabled = var.domain_name != "" && var.hosted_zone_id != ""
}

# ---------------------------------------------------------------------------
# ACM Certificate
# ---------------------------------------------------------------------------
resource "aws_acm_certificate" "this" {
  count = local.enabled ? 1 : 0

  domain_name       = "*.${var.domain_name}"
  validation_method = "DNS"

  subject_alternative_names = [var.domain_name]

  lifecycle {
    create_before_destroy = true
  }

  tags = var.tags
}

# ---------------------------------------------------------------------------
# DNS Validation Records
# ---------------------------------------------------------------------------
resource "aws_route53_record" "validation" {
  count = local.enabled ? 1 : 0

  zone_id = var.hosted_zone_id
  name    = aws_acm_certificate.this[0].domain_validation_options[0].resource_record_name
  type    = aws_acm_certificate.this[0].domain_validation_options[0].resource_record_type
  records = [aws_acm_certificate.this[0].domain_validation_options[0].resource_record_value]
  ttl     = 60

  allow_overwrite = true
}

# ---------------------------------------------------------------------------
# Certificate Validation
# ---------------------------------------------------------------------------
resource "aws_acm_certificate_validation" "this" {
  count = local.enabled ? 1 : 0

  certificate_arn         = aws_acm_certificate.this[0].arn
  validation_record_fqdns = [aws_route53_record.validation[0].fqdn]
}
