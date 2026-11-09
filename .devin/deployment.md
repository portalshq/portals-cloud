# Deployment runbook — Portals Cloud

This runbook covers deploying the **Portals Cloud** product, which has two
publish surfaces:

1. **Frontend site** (`portals.works`) — the marketing/lead/pilot site in
   `frontend/`, deployed to **Vercel** automatically from `main`.
2. **Platform infrastructure** — the Control Plane + Lore services on **AWS**
   (ECS Fargate, RDS PostgreSQL, DynamoDB, S3, ALB/NLB), managed by **Pulumi**
   in `infra/pulumi/` and deployed manually.

Everything below is for the `dev` environment on AWS. Pulumi never builds
Docker images — `infra/lore/versions.yaml` is the single source of truth for
what image is deployed. An empty `control-plane.image` pin is fail-open:
`pulumi up` skips the Control Plane service with a warning instead of failing.

---

## 1. Frontend site (Vercel)

The frontend deploys on push: Vercel is linked to the GitHub repo
(`frontend/` as root directory, framework `nextjs`, build `npm run build`).
Pushing to `main` triggers a production deployment of `portals.works`.

**Config lives in** `frontend/vercel.json` and `frontend/.vercel/project.json`.

**Before/after deploy:**

- Required environment variables are in `frontend/.env.example`; the full
  table (leads DB, Resend, Stripe, `PILOT_ROOM_SECRET`, `NEXT_PUBLIC_SITE_URL`,
  `CRON_SECRET`, …) is in `frontend/TESTING_AND_DEPLOYMENT.md`.
- Stripe webhook endpoint must be configured:
  `https://portals.works/api/stripe/webhook` with `checkout.session.completed`.
- Vercel cron in `vercel.json` calls `/api/internal/leads/retry` daily
  (`0 0 * * *`); it requires the `CRON_SECRET` bearer header.
- Sanity production dataset must publish the `paid-pilot` document + price
  specs.

**Verification:** load `https://portals.works`, run a test pilot payment on a
staging env, and confirm the webhook flips the room to `paid`.

> Note: the GitHub repo moved to `portalshq/portals-cloud`. If Vercel's Git
> integration is still bound to the old `DigitalCreationsCo` URL, deployments
> can silently stop — confirm the binding in the Vercel dashboard.

---

## 2. Platform infrastructure (AWS via Pulumi)

### Prerequisites

- Node.js, the Pulumi CLI (`brew install pulumi`), `aws configure` credentials
- Docker + `docker login` to Docker Hub (public images are pulled by ECS with
  no extra auth)

### Deploy flow

```bash
# 1. Build, push to Docker Hub, and pin the image (writes versions.yaml)
control-plane/scripts/publish-image.sh
#    → portalshq/control-plane:<git-short-sha>-<timestamp>
#    (override namespace/repo with HUB_IMAGE, e.g. HUB_IMAGE=acme/control-plane)

# 2. Commit the new pin, then preview + apply
cd infra/pulumi
npm test                 # versioning tests + pipeline regression tests
pulumi preview -s dev
pulumi up -s dev

# 3. Verify ECS runs the pinned image (exit 0 = in sync, 1 = drift, 2 = error)
control-plane/scripts/verify-and-update-versions.sh dev
```

- **Fresh stack:** with an empty pin, the first `pulumi up` creates everything
  except the Control Plane service. Run `publish-image.sh`, then `pulumi up`
  again to add it.
- **Stack config** is in `infra/pulumi/Pulumi.dev.yaml` (region `us-east-1`,
  `db.t4g.micro`, 20 GB, PostgreSQL `15.18`); all defaults are in `Pulumi.yaml`.

### Rollback

Re-pin a previous image in `infra/lore/versions.yaml` and `pulumi up -s dev`.
After a manual deploy that bypassed the pipeline,
`verify-and-update-versions.sh dev --write` corrects the pin to what ECS is
actually running.

---

## 3. Tests before deploy

```bash
cd infra/pulumi && npm test        # versioning.test.ts (4) + test-pipeline.sh
cd infra/pulumi && npm run build   # tsc
bash -n control-plane/scripts/publish-image.sh
bash -n control-plane/scripts/verify-and-update-versions.sh
```

`test-pipeline.sh` guards the awk pin write/read roundtrip, asserts no ECR or
`build-and-push-ecr` references remain, and checks the verify script fails
cleanly (exit 2) when nothing is deployed.

---

## 4. Troubleshooting

- **Control Plane missing after `up`:** pin is empty — run `publish-image.sh`
  and `up` again (see fail-open behavior above).
- **`verify` exits 2:** versions.yaml pin unset, or the ECS service isn't in
  the stack (is the cluster actually deployed?).
- **`verify` reports drift:** `--write` to adopt the deployed image, or re-pin
  and redeploy.
- **AWS CLI needed by scripts:** `publish-image.sh` requires Docker Hub only;
  `verify-and-update-versions.sh` requires AWS credentials.
