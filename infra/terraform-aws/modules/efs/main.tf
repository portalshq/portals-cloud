# =============================================================================
# EFS Module — Lore Persistent Storage
# =============================================================================
#
# Provides persistent, shared filesystem storage for the Lore server:
#   - Mutable store (branch pointers, key-value metadata)
#   - Lock store (in-process locks, survives container restarts)
#   - TLS certificates (generated once, persisted)
#
# =============================================================================

resource "aws_efs_file_system" "lore" {
  creation_token = "${var.environment}-portals-cloud-lore-data"
  encrypted      = true

  performance_mode = "generalPurpose"
  throughput_mode  = "bursting"

  tags = merge(var.tags, {
    Name        = "${var.environment}-portals-cloud-lore-data"
    Environment = var.environment
  })
}

data "aws_vpc" "selected" {
  id = var.vpc_id
}

resource "aws_security_group" "efs" {
  name_prefix = "${var.environment}-portals-cloud-efs-"
  description = "Allow NFS access to Lore EFS from within VPC"
  vpc_id      = var.vpc_id

  ingress {
    description = "NFS from VPC"
    from_port   = 2049
    to_port     = 2049
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.selected.cidr_block]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.environment}-portals-cloud-efs-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_efs_mount_target" "lore" {
  count = length(var.private_subnet_ids)

  file_system_id  = aws_efs_file_system.lore.id
  subnet_id       = var.private_subnet_ids[count.index]
  security_groups = [aws_security_group.efs.id]
}

resource "aws_efs_access_point" "lore_data" {
  file_system_id = aws_efs_file_system.lore.id

  root_directory {
    path = "/data"

    creation_info {
      owner_gid   = 0
      owner_uid   = 0
      permissions = "0755"
    }
  }

  posix_user {
    gid = 0
    uid = 0
  }

  tags = merge(var.tags, {
    Name = "${var.environment}-portals-cloud-lore-data-ap"
  })
}
