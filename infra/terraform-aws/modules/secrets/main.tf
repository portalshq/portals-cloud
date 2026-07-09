# =============================================================================
# Secrets Manager Module — JWT, DB, HMAC, JWKS
# =============================================================================

# ---------------------------------------------------------------------------
# Generate JWT signing key (ECDSA P-256)
# ---------------------------------------------------------------------------
resource "tls_private_key" "jwt" {
  algorithm   = "ECDSA"
  ecdsa_curve = "P256"
}

# ---------------------------------------------------------------------------
# Compute JWKS from the ECDSA public key using external tooling
# ---------------------------------------------------------------------------
data "external" "jwks" {
  program = ["python3", "-c", <<-PYEOF
import base64, json, subprocess, sys

# Read the query JSON from stdin
query = json.load(sys.stdin)
pem = query["pem"]

# Convert PEM to DER to extract EC point coordinates
proc = subprocess.run(
  ["openssl", "ec", "-pubin", "-outform", "DER"],
  input=pem.encode(),
  capture_output=True,
  text=True
)
der = proc.stdout.encode("latin-1")

# Find uncompressed EC point (04 || x(32) || y(32))
idx = der.index(b'\x04')
pubkey = der[idx:]
x_bytes = pubkey[1:33]
y_bytes = pubkey[33:65]

x_b64 = base64.urlsafe_b64encode(x_bytes).rstrip(b'=').decode()
y_b64 = base64.urlsafe_b64encode(y_bytes).rstrip(b'=').decode()

result = {
  "keys": [{
    "kty": "EC",
    "crv": "P-256",
    "x": x_b64,
    "y": y_b64,
    "kid": "portals-cloud-1",
    "use": "sig",
    "alg": "ES256"
  }]
}
print(json.dumps({"jwks": json.dumps(result)}))
PYEOF

  query = {
    pem = tls_private_key.jwt.public_key_pem
  }
}

locals {
  jwks_string  = data.external.jwks.result["jwks"]  # raw JSON string
  jwks_content = jsondecode(local.jwks_string)       # parsed object (for app_secrets nesting)
  jwt_kid      = var.jwt_kid != "" ? var.jwt_kid : random_id.jwt_kid.hex
}

# ---------------------------------------------------------------------------
# JWT Key ID (deterministic)
# ---------------------------------------------------------------------------
resource "random_id" "jwt_kid" {
  byte_length = 8
}

# ---------------------------------------------------------------------------
# HMAC Key (for Lore presigned URLs)
# ---------------------------------------------------------------------------
resource "random_password" "hmac_key" {
  length  = 64
  special = false
}

resource "aws_secretsmanager_secret" "hmac_key" {
  name                    = "${var.name_prefix}-hmac-key"
  description             = "HMAC key for Lore presigned URLs"
  recovery_window_in_days = 7
  tags                    = var.tags
}

resource "aws_secretsmanager_secret_version" "hmac_key" {
  secret_id     = aws_secretsmanager_secret.hmac_key.id
  secret_string = random_password.hmac_key.result
}

# ---------------------------------------------------------------------------
# JWKS Secret (public key in JWKS format)
# ---------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "jwks" {
  name                    = "${var.name_prefix}-jwks"
  description             = "JWKS public key set for JWT validation"
  recovery_window_in_days = 7
  tags                    = var.tags
}

resource "aws_secretsmanager_secret_version" "jwks" {
  secret_id     = aws_secretsmanager_secret.jwks.id
  secret_string = local.jwks_string
}

# ---------------------------------------------------------------------------
# JWT Signing Key — Private Key
# ---------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "jwt_private_key" {
  name                    = "${var.name_prefix}-jwt-private-key"
  description             = "JWT ECDSA P-256 private signing key"
  recovery_window_in_days = 7
  tags                    = var.tags
}

resource "aws_secretsmanager_secret_version" "jwt_private_key" {
  secret_id     = aws_secretsmanager_secret.jwt_private_key.id
  secret_string = tls_private_key.jwt.private_key_pem
}

# ---------------------------------------------------------------------------
# JWT Signing Key — Public Key (for verification)
# ---------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "jwt_public_key" {
  name                    = "${var.name_prefix}-jwt-public-key"
  description             = "JWT ECDSA P-256 public verification key"
  recovery_window_in_days = 7
  tags                    = var.tags
}

resource "aws_secretsmanager_secret_version" "jwt_public_key" {
  secret_id     = aws_secretsmanager_secret.jwt_public_key.id
  secret_string = tls_private_key.jwt.public_key_pem
}

# ---------------------------------------------------------------------------
# Database Connection URL
# ---------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "database_url" {
  name                    = "${var.name_prefix}-database-url"
  description             = "PostgreSQL connection URL"
  recovery_window_in_days = 7
  tags                    = var.tags
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = var.database_url
}

# ---------------------------------------------------------------------------
# AWS Credentials (for Lore S3/DynamoDB when not using IAM roles)
# ---------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "aws_access_key_id" {
  name                    = "${var.name_prefix}-aws-access-key-id"
  description             = "AWS access key for Lore S3/DynamoDB"
  recovery_window_in_days = 7
  tags                    = var.tags
}

resource "aws_secretsmanager_secret_version" "aws_access_key_id" {
  secret_id     = aws_secretsmanager_secret.aws_access_key_id.id
  secret_string = var.aws_access_key_id
}

resource "aws_secretsmanager_secret" "aws_secret_access_key" {
  name                    = "${var.name_prefix}-aws-secret-access-key"
  description             = "AWS secret key for Lore S3/DynamoDB"
  recovery_window_in_days = 7
  tags                    = var.tags
}

resource "aws_secretsmanager_secret_version" "aws_secret_access_key" {
  secret_id     = aws_secretsmanager_secret.aws_secret_access_key.id
  secret_string = var.aws_secret_access_key
}

# ---------------------------------------------------------------------------
# App Secrets (aggregated JSON for server)
# ---------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "app_secrets" {
  name                    = "${var.name_prefix}-app-secrets"
  description             = "Aggregated application secrets (JSON)"
  recovery_window_in_days = 7
  tags                    = var.tags
}

resource "aws_secretsmanager_secret_version" "app_secrets" {
  secret_id = aws_secretsmanager_secret.app_secrets.id
  secret_string = jsonencode({
    JWT_PRIVATE_KEY       = tls_private_key.jwt.private_key_pem
    JWT_PUBLIC_KEY        = tls_private_key.jwt.public_key_pem
    JWT_KID               = local.jwt_kid
    JWT_ISSUER            = var.jwt_issuer
    JWT_AUDIENCE          = jsonencode(var.jwt_audience)
    DATABASE_URL          = var.database_url
    HMAC_KEY              = random_password.hmac_key.result
    JWKS                  = local.jwks_content
    AWS_ACCESS_KEY_ID     = var.aws_access_key_id
    AWS_SECRET_ACCESS_KEY = var.aws_secret_access_key
    AWS_REGION            = var.aws_region
  })
}
