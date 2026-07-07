# infra/terraform/linode

LKE cluster + S3-compatible Object Storage. This is intentionally the only
provider-specific Terraform in the repo — everything that runs on top
(infra/k8s/base) is plain Kubernetes manifests, so moving to a different
provider's K8s offering later is a `terraform` swap, not an application
rewrite.

Before running against production: `lke_node_type` and node counts are
unsized placeholders. Load-test the control plane and the realtime-fanout
data plane separately before committing to a node shape — they have very
different scaling profiles (see root README / ADR 0001).
