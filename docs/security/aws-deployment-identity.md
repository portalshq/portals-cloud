# AWS deployment identity runbook

This runbook replaces the long-lived `portals-deployer` IAM user with temporary,
individually attributable role sessions. It separates routine artifact releases
from rare infrastructure/bootstrap changes so a compromised CI workflow cannot
administer IAM, KMS, networking, or recovery controls.

## Target identities

| Identity | Assumed by | Purpose | Maximum session |
|---|---|---|---|
| `PortalsProductionReadOnly` | IAM Identity Center users | Preview, inventory, logs, findings | 4 hours |
| `PortalsProductionInfrastructure` | IAM Identity Center platform group with MFA | Reviewed Pulumi infrastructure changes | 1 hour |
| `portals-github-release` | GitHub OIDC, production environment only | Build/push/promote signed artifacts and update approved ECS releases | 1 hour |
| `PortalsBreakGlass` | Two authorized humans with MFA | Recovery when normal roles cannot operate | 1 hour |
| ECS task/execution roles | ECS only | Runtime AWS APIs and secret injection | Service session |

Do not put deployment access keys in GitHub, Pulumi configuration, developer
shell profiles, or user groups. IAM user groups organize IAM users; they do not
make credentials temporary. Use IAM Identity Center groups for humans and role
trust policies for automation.

## 1. Establish human SSO

1. Enable IAM Identity Center in the AWS Organizations management account.
2. Require MFA and create a `PortalsProductionPlatform` group.
3. Create the read-only and infrastructure permission sets above.
4. Assign the production account to the group. Keep daily users on read-only;
   elevate to infrastructure only for an approved change window.
5. Set the infrastructure permission-set session to one hour. Do not assign it
   to shared identities.

The infrastructure permission set may use
`infra/pulumi/policies/deployer-security-bootstrap.json` and
`infra/pulumi/policies/deployer-recovery-bootstrap.json` during migration.
Those policies are intentionally temporary and split only because an AWS
managed policy is limited to 6,144 characters. After two successful deployments, use IAM
Access Analyzer policy generation plus CloudTrail last-accessed data to remove
unused actions and resources.

Use the current `portals-pulumi-deployer` IAM user only for this cutover. The
fact that a narrow policy is attached does not make a long-lived access key a
production best practice. Once SSO assumption and one rollback are tested,
deactivate its key; do not leave the user as an alternate deployment path.

Durably split IAM bootstrap from routine infrastructure deployment:

- the short-session `PortalsSecurityBootstrap` role may create/update Portals
  runtime roles, policies, boundaries, and trust policies during an approved
  bootstrap window;
- `PortalsProductionInfrastructure` may change the application infrastructure
  and pass only the exact pre-created runtime-role ARNs, but cannot create a
  role or mutate its policy/trust/boundary;
- `portals-github-release` may push verified artifacts and roll the exact ECS
  services, but cannot modify IAM, networking, KMS administration, databases,
  WAF, logging, or backups.

Until the Pulumi IAM resources are split into their own bootstrap stack, the
infrastructure role can temporarily retain the repository bootstrap policy.
Treat every use as elevated, require MFA/review, and remove IAM mutation from
the role immediately after that split.

## 2. Apply a permissions boundary

A permissions boundary is a maximum, not a grant. Attach a boundary to every
Portals role that can create or pass another role. The boundary must:

- allow only the AWS service families used by this stack and only `us-east-1`
  for regional operations;
- limit account resources to account `907199504810` and Portals names, ARNs, or
  `Project=portals` tags where the service supports them;
- deny `iam:CreateUser`, `iam:CreateAccessKey`, console-login creation, and
  modification of the caller's own role, trust policy, policies, or boundary;
- permit `iam:PassRole` only for the exact ECS, Lambda backup, VPC Flow Logs,
  and EventBridge Scheduler roles, with `iam:PassedToService` conditions;
- deny disabling/deleting CloudTrail, Access Analyzer, audit buckets, backup
  snapshots, KMS keys, and deletion protection in routine roles;
- leave destructive recovery actions exclusively to `PortalsBreakGlass`.

A role-name prefix by itself is not a sufficient guardrail. Permission to
`iam:PutRolePolicy` on `portals-*` can still create a privileged passable role.
If a deployment role is temporarily allowed to create runtime roles, require a
separately reviewed workload boundary in the `iam:CreateRole`
`iam:PermissionsBoundary` condition, deny removing/changing that boundary, and
scope `iam:PassRole` by both exact ARN and `iam:PassedToService`. The durable
state is still pre-created roles plus no routine IAM mutation.

Because explicit denies override attached policies, preview the boundary with
IAM Policy Simulator before attaching it. Test a non-destructive Pulumi preview,
image promotion, ECS rollout, snapshot invocation, and rollback. A boundary
that prevents normal rollback is not adequate; move the necessary narrowly
scoped rollback action into the infrastructure role rather than broadening CI.

The repository boundary template is
`infra/pulumi/policies/deployer-permissions-boundary.json`. It permits only the
service families used by this stack, denies creation of long-lived IAM
credentials and all routine IAM mutation, denies routine deletion of
audit/recovery controls, and denies regional deployment outside `us-east-1`.
It allows only read-only IAM inventory plus passing pre-created roles. The
attached role policy still has to grant each operation; the boundary grants
nothing by itself.

Do not attach this routine boundary while the main Pulumi stack still plans to
create or edit IAM roles. First apply/import the reviewed runtime roles through
`PortalsSecurityBootstrap`, split their definitions into the bootstrap stack,
and make the application stack accept their ARNs as inputs. A preview under the
routine infrastructure role must then show no IAM creates, policy mutations, or
trust-policy mutations. Attach the boundary only after that condition is true.

Create it from an existing approved administrator session:

```bash
aws iam create-policy \
  --policy-name portals-deployer-permissions-boundary \
  --policy-document file://infra/pulumi/policies/deployer-permissions-boundary.json

```

Configure the customer-managed policy as the boundary on the IAM Identity
Center infrastructure permission set, then reprovision it to the account:

```bash
PORTALS_SSO_INSTANCE_ARN="arn:aws:sso:::instance/ssoins-REPLACE"
PORTALS_PERMISSION_SET_ARN="arn:aws:sso:::permissionSet/ssoins-REPLACE/ps-REPLACE"

aws sso-admin put-permissions-boundary-to-permission-set \
  --instance-arn "${PORTALS_SSO_INSTANCE_ARN}" \
  --permission-set-arn "${PORTALS_PERMISSION_SET_ARN}" \
  --permissions-boundary \
  '{"CustomerManagedPolicyReference":{"Name":"portals-deployer-permissions-boundary","Path":"/"}}'

aws sso-admin provision-permission-set \
  --instance-arn "${PORTALS_SSO_INSTANCE_ARN}" \
  --permission-set-arn "${PORTALS_PERMISSION_SET_ARN}" \
  --target-type AWS_ACCOUNT \
  --target-id 907199504810
```

For a conventional IAM role instead, use `iam put-role-permissions-boundary`
with the policy ARN. Do not attach this routine boundary to
`PortalsBreakGlass`; give break-glass a separately reviewed boundary and
alerting because routine deletion is deliberately blocked here.

## 3. Configure GitHub OIDC

Create one AWS OIDC provider for `https://token.actions.githubusercontent.com`
with audience `sts.amazonaws.com`. The `portals-github-release` trust policy
must bind the role to the exact repository and protected GitHub environment:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::907199504810:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": "repo:DigitalCreationsCo/portals-cloud:environment:production"
      }
    }
  }]
}
```

The production GitHub environment must require a reviewer, allow deployment
only from protected release tags or `main`, and expose no long-lived AWS secret.
The workflow needs only:

```yaml
permissions:
  contents: read
  id-token: write

environment: production
```

The role's permissions policy should grant only ECR publication/inspection,
artifact-signing operations for the dedicated artifact key, ECS task-definition
registration and service update for the Portals cluster, read-only health/log
inspection, and `iam:PassRole` for the exact ECS execution/task roles. It must
not include IAM administration, Cognito administration, KMS key administration,
RDS deletion, security-control disablement, or unrestricted `s3:*`.

Do not run the full infrastructure Pulumi stack from this release role. Network,
IAM, KMS, Cognito, database, WAF, and recovery changes use the human SSO
infrastructure role after a reviewed `pulumi preview --diff`.

## 4. Create break-glass access

Create `PortalsBreakGlass` separately from CI and ordinary permission sets.
Require MFA in its trust policy, alert on every `AssumeRole`, keep its session at
one hour, and document two-person approval. Do not create an access key for it.
Test assumption and CloudTrail visibility quarterly without exercising a
destructive action.

## 5. Cut over and retire the IAM user

1. Run `aws sts get-caller-identity` under each SSO/OIDC role and record the ARN.
2. Run a contained Pulumi preview using the infrastructure role.
3. Publish a non-production image and verify ECR/Trivy/signature receipts using
   the OIDC release role.
4. Invoke the scheduled RDS snapshot Lambda and confirm a new encrypted manual
   snapshot plus a successful alarm state.
5. Apply one contained infrastructure update and verify CloudTrail attribution.
6. Inspect the old IAM access-key last-used timestamp and CloudTrail events.
7. Deactivate—not delete—the old key. Observe one full deployment cycle.
8. Delete the key, detach `portals-pulumi-deploy` and
   `portals-security-bootstrap-20260810`, then delete `portals-deployer`.
9. Review Access Analyzer and CloudTrail for unexpected trust or use after the
   cutover.

For each operator workstation, use an SSO profile rather than exporting keys:

```bash
aws configure sso --profile portals-production-infrastructure
aws sso login --profile portals-production-infrastructure
aws sts get-caller-identity --profile portals-production-infrastructure
AWS_PROFILE=portals-production-infrastructure \
  /Users/vibrantceo/.pulumi/bin/pulumi preview --diff
```

If any workflow still depends on the old key, restore containment and fix that
workflow. Do not reactivate the user as a permanent workaround.

## Review cadence

Quarterly, review group membership, permission-set assignments, OIDC trust
conditions, last-used actions, Access Analyzer findings, role assumption logs,
permissions-boundary changes, and break-glass tests. Record the completed date
in Pulumi `securityReviewDate`; public ingress rejects a date older than 90 days.
