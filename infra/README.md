# infra/

`terraform/linode` provisions the LKE cluster + object storage.
`terraform/akamai-cdn` documents the CDN integration point (left as a
placeholder pending real Akamai account provisioning — see its README).
`k8s/base` is plain Kubernetes manifests deployed onto LKE — labeled by
`plane: control` vs `plane: data` so they can be split onto separate
node pools later without restructuring, per the control/data plane
separation in the architecture review.

Apply order:
```bash
cd terraform/linode && terraform init && terraform apply
# then, using the resulting kubeconfig:
kubectl apply -f k8s/base/
```

Nothing here is wired to CI/CD yet — `image: REPLACE_ME/...` placeholders
need a real registry once Dockerfiles exist for runtime-core and registry.
