# Kubernetes cluster hosting runtime-core, registry, resolver, and the
# capability services. Cloud-agnostic by design: this is standard
# Kubernetes underneath, so the only Linode-specific piece is this file —
# everything in infra/k8s/base is portable to any provider's K8s offering.

resource "linode_lke_cluster" "platform" {
  label       = "portals-platform-${var.environment}"
  k8s_version = "1.30"
  region      = var.region

  pool {
    type  = var.lke_node_type
    count = var.lke_node_count

    autoscaler {
      min = var.lke_node_count
      max = var.lke_node_count * 3 # headroom for audience-driven concurrency spikes
    }
  }
}

output "kubeconfig" {
  value     = linode_lke_cluster.platform.kubeconfig
  sensitive = true
}

output "cluster_endpoint" {
  value = linode_lke_cluster.platform.api_endpoints
}
