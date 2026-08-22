# GitHub OIDC Release Policies

Two IAM documents for GitHub Actions release publishing via OIDC (no long-lived keys):

- `github-oidc-release-trust.json` — trust policy: who can assume the role. Scoped to
  `repo:DigitalCreationsCo/portals-cloud` tag pushes matching `refs/tags/v*`, audience `sts.amazonaws.com`.
  Note: the OIDC IdP (`token.actions.githubusercontent.com`) must be created separately in the account;
  no thumbprint is required for GitHub post-2023.
- `github-oidc-release-permissions.json` — permissions policy: what the role can do. ECR push/pull limited to
  `portals-prod/*` repositories, plus artifact signing only against the `portals-artifact-signing` KMS key.
  No other KMS access and no JWT signer access is granted.

## Suggested setup

1. Create an IAM role named `portals-github-release` with the trust policy above attached as its
   assume-role policy, then attach `github-oidc-release-permissions.json` as a managed/inline policy on it.
2. In the release workflow, publishers consume the role via the standard env var:

   ```yaml
   permissions:
     id-token: write
     contents: read
   env:
     AWS_ROLE_TO_ASSUME: arn:aws:iam::907199504810:role/portals-github-release
   ```

   The workflow authenticates with `aws-actions/configure-aws-credentials` using that role ARN.

## Staged plan

ECS-rollout and read-only deployment roles come later; this covers only image publish + artifact signing.
