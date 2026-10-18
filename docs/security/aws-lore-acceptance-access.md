# AWS access for Lore acceptance and recovery

This document separates the identity used by the running Lore service from
temporary acceptance and recovery access. It records what could be verified
locally on 2026-10-18 and what must be supplied before live AWS tests can run.

## Identities are separate

| Identity | Purpose | Permissions |
|---|---|---|
| `PortalsLoreServiceUser` (current Lore credential file) | Lore's normal S3 and DynamoDB reads/writes | Only the configured Lore bucket and four Lore tables/indexes. Do not add restore, IAM, Organizations, or account-administration access. |
| `PortalsLoreAcceptanceReadWrite` (to create) | Run a small, tagged write/read/delete acceptance fixture against the same Lore stores | Same resource scope as the Lore runtime identity, plus only the read-only calls needed to identify the caller and inspect configured tables/bucket. No IAM mutation, restore, table/bucket creation, or Organizations access. |
| `PortalsLoreRecovery` (to create separately) | Restore known test data into isolated targets and prove recovery | Read the selected source backup/version data and create, verify, tag, and remove only named isolated targets. Time-limited session; no changes to source data or runtime IAM. |
| Human AWS profile | Review identity/policies and start a session for the intended role | Read-only review by default. Never use an account-wide/full-access role for routine acceptance. |

Acceptance tests should first use the **actual Lore runtime credentials** to
prove its configured principal and normal allowed/denied operations. The
acceptance read/write role is only needed if the host cannot safely use the
existing Lore credential file or an auditable separate test principal is
required. Recovery access must never be placed in Lore's environment file.

## What is verified

- A prior read-only check using Lore's configured AWS credentials identified
  account `168692731058`, IAM user `PortalsLoreServiceUser`, and successfully
  ran `HeadBucket` and `DescribeTable` on the configured Lore resources.
- The current infrastructure code defines four DynamoDB tables using the
  `${projectName}-${environment}-lore-{fragments,metadata,mutable,locks}`
  naming pattern. With the production stack's configured project `portals` and
  environment `prod`, the expected names are `portals-prod-lore-fragments`,
  `portals-prod-lore-metadata`, `portals-prod-lore-mutable`, and
  `portals-prod-lore-locks`. Confirm live names and indexes before policy
  creation; do not infer the S3 bucket name from this pattern because Pulumi
  may add a generated suffix.
- Lore's runtime policy in the infrastructure source allows object
  get/put/delete/list and the DynamoDB data-plane operations against its
  configured resources. A prior review found `AWSOrganizationsReadOnlyAccess`
  attached to the Lore user; that policy is not needed for Lore storage and
  should be removed by the AWS account owner after checking it is not used for
  another purpose.
- The developer machine's only local AWS profile is `default`, configured
  through AWS CLI console login for `AccountFullAccessRole`. Its session is
  expired/unusable: `aws sts get-caller-identity` attempted the sign-in token
  endpoint and failed. Do **not** refresh or use that broad profile for the
  acceptance or restore work.

These facts do not prove current IAM effective permissions, successful object
or item writes, a denial, or a restore. No named isolated restore target or
spending/outage envelope is configured in the repository.

## Least-privilege access to provision

Have an account administrator create two short-lived role sessions (or
equivalent temporary federated credentials) in account `168692731058`:

### `PortalsLoreAcceptanceReadWrite`

Scope the S3 data actions to the exact Lore bucket ARN and its object ARN.
Scope DynamoDB data actions to the four exact production table ARNs and their
index ARNs. Include only operations actually exercised by the acceptance
fixture: `s3:GetBucketLocation`, `s3:ListBucket`, `s3:GetObject`,
`s3:PutObject`, `s3:DeleteObject`; DynamoDB `DescribeTable`, `GetItem`,
`PutItem`, `UpdateItem`, `DeleteItem`, `Query`, and any batch/transaction
operations the fixture uses. Keep source writes confined to unique
`acceptance/<run-id>/` S3 keys and uniquely keyed DynamoDB fixture items; the
script must delete only those exact test records after readback. If the
production schemas do not permit a safely isolated marker, use a separate
acceptance bucket/tables instead of writing to customer data.

Add only the specific STS caller-identity action needed to report the role
ARN. Exclude `iam:*`, Organizations, bucket/table creation, policy changes,
and restore actions.

### `PortalsLoreRecovery`

Create only after the owner supplies exact source resources, backup point,
isolated destination names, and a maximum spend. Grant read access to the
selected source object versions and/or DynamoDB backup/PITR data. Grant
creation, tagging, describe, data write/read, and cleanup actions only for the
named destination bucket/table ARNs. Keep restore permissions separate from
source mutation permissions. If DynamoDB PITR restore requires permissions on
the source table, permit only the exact source table plus the one explicitly
named new target; never allow replacement of the production table. Apply an
expiration tag and a session duration no longer than the approved drill
window. Do not enable PITR or create snapshots as part of an unbounded test.

An IAM read-only reviewer should independently inspect the role trust policy,
attached/inline policies, permissions boundary, resource policies, and
organization SCPs. For the Lore service principal, use policy simulation and
real harmless denials to compare effective permissions with its intended
scope. Do not add broad read-only managed policies to the workload user as a
substitute for reviewing the exact policy.

## Inputs required before the live AWS work

The account owner must provide these values through the private acceptance
profile or an approved secure channel; do not put credentials in Git or chat:

1. The exact Lore S3 bucket name/ARN and region, and the four live DynamoDB
   table names, ARNs, and lock-table index names.
2. The current Lore runtime principal's allowed policy and the controlled
   unrelated resource used for a real `AccessDenied` test. Confirm whether
   the Lore credential file is an IAM user key or a temporary role session;
   do not expose key material.
3. A trust method and fresh session for `PortalsLoreAcceptanceReadWrite` if a
   distinct test principal is selected.
4. For restore: source backup/version/PITR timestamp, exact isolated target
   bucket and table names (or permission to create names under an agreed
   `portals-acceptance-<run-id>` namespace), cleanup owner, maximum spend, and
   an explicit confirmation that the source is production data or a safe
   nonproduction copy.
5. A recovery session for `PortalsLoreRecovery`, separately from Lore's
   runtime credentials, plus the RPO/RTO and allowed drill window.

The AWS console user can provide these by creating the two named roles and
sharing only role ARNs and resource identifiers. The agent can then assume
the restricted roles, run the tests, and return the role identity, sanitized
resource names, operation outcomes, and CloudTrail evidence references.

## Current blocker and safe next action

The current local `default` profile is not the requested scoped acceptance
role; it resolves to an expired `AccountFullAccessRole` console-login
session. Refreshing it would give the test process broad account access, so it
was deliberately left expired. The prior Lore-scoped host credentials are
not available to this local CLI, and the installed Mac remote-operations gate
does not expose them or permit arbitrary AWS commands. No restore target or
cost envelope exists, so no restore was attempted.

The next safe step is to provision the narrowly scoped acceptance role and
named isolated targets above, then configure a named profile for that role.
After `aws sts get-caller-identity` confirms the expected role ARN, run the
read-only resource and policy checks first. The separate restore role remains
unused until its target, backup point, cost cap, and drill window are
recorded.
