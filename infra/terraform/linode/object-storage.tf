# S3-API-compatible object storage for world/narrative state and assets.
# Per the platform economics review, world/narrative storage is cheap and
# scales with narrative complexity, not audience size — this bucket is not
# the cost driver. Video delivery is (see infra/terraform/akamai-cdn).

resource "linode_object_storage_bucket" "world_state" {
  cluster = "us-east-1" # Linode object storage cluster id — distinct from compute region above
  label   = "portals-platform-world-state-${var.environment}"
}

resource "linode_object_storage_bucket" "assets" {
  cluster = "us-east-1"
  label   = "portals-platform-assets-${var.environment}"
}

resource "linode_object_storage_key" "platform_access" {
  label = "portals-platform-${var.environment}-key"
}

output "object_storage_access_key" {
  value     = linode_object_storage_key.platform_access.access_key
  sensitive = true
}
