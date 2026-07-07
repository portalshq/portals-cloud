# ADR 0001: Kubernetes-first on Linode (LKE), CDN/edge on Akamai

## Status
Accepted

## Context
Cost-effectiveness matters, and there's an explicit preference for
Linode/Akamai over a hyperscaler. The platform economics review identified
audience-member marginal cost (dominated by video egress + real-time
fan-out volume) as the cost line that actually scales with success — that's
the number to optimize, not compute list price.

## Decision
- **Compute/control-plane: Kubernetes on Linode (LKE).** Standard K8s
  underneath means nothing here is Linode-proprietary — `infra/k8s/base`
  would deploy onto EKS/GKE/any K8s with only `infra/terraform/*` changing.
  This is the cloud-agnostic posture, achieved by *not* depending on any
  provider-specific managed service inside the application layer.
- **Storage: Linode Object Storage**, S3-API-compatible, so no
  proprietary storage SDK is embedded in any capability package.
- **Real-time fan-out: self-hosted NATS JetStream** instead of a managed
  pub/sub service. Linode doesn't offer an SQS/SNS-equivalent managed
  service; rather than reach for a hyperscaler just for this, JetStream
  runs in-cluster and is itself portable.
- **Video/asset edge delivery: Akamai.** This is the one piece kept
  separate from "generic K8s" because CDN economics and edge presence are
  genuinely provider-differentiated, and egress is the dominant linear
  cost. Akamai's edge network size is a real cost advantage here that a
  cloud-agnostic posture shouldn't sacrifice.

## Consequences
- Control-plane and data-plane services (per the architecture review's
  control/data plane split) can be scheduled on separate LKE node pools
  using the `plane` label already set in `infra/k8s/base`.
- Moving compute to a different provider later is a Terraform change, not
  an application rewrite. Moving *off* Akamai for CDN is a separate,
  independent decision — it's the one deliberately coupled choice, made
  because the cost math justifies it.
- Tradeoff accepted: self-hosting NATS means the team owns its operational
  burden (upgrades, scaling, failover) instead of paying a managed-service
  premium. Revisit if/when ops overhead outweighs the cost savings.
