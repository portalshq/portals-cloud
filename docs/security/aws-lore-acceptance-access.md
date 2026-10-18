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
- The current infrastructure code explicitly names the S3 bucket
  `portals-prod-lore-chunks` and the four tables
  `portals-prod-lore-{fragments,metadata,mutable,locks}` for a `portals/prod`
  stack. These are **code expectations**, not a live resource inventory.
  Confirm the active stack and live resource names before creating policy or
  running the fixture. The four table partition/sort keys are binary:
  `hash/repository_context`, `hash`, `repository_id/key`, and
  `hash/repositoryBranch`, respectively.
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

Use the executable [policy generator](../../infra/mac-bootstrap/scripts/lore-aws-acceptance-policy.mjs)
to produce the exact inline permissions policy after confirming the live bucket
and region. It grants only `GetBucketLocation`, version listing under
`acceptance/*`, object put/get/version deletion under that prefix, and
`DescribeTable`/`PutItem`/`GetItem`/`DeleteItem` on the four named tables.
Because the production table keys are binary, this policy cannot safely
restrict DynamoDB writes to a textual fixture partition. The role can write
other items in those four tables while its session is live. Limit its session
duration, keep it separate from the workload identity, and review the trust
policy before use. `sts:GetCallerIdentity` does not require an IAM allow.
Exclude `iam:*`, Organizations, bucket/table creation, policy changes, and
restore actions.

The fixture uses unique 32-byte binary keys, conditional puts, consistent
readback, and conditional deletes. It puts one tiny object under a unique
`acceptance/<UUID>/` key, reads it, then permanently deletes **that exact
version** rather than leaving an S3 delete marker. S3 version deletion needs
`s3:DeleteObjectVersion`, not just `s3:DeleteObject`. It records an exact
cleanup key on failure. A machine/process crash can interrupt cleanup; inspect
the reported prefix before rerunning. [AWS documents version-specific
deletion](https://docs.aws.amazon.com/AmazonS3/latest/userguide/DeletingObjectVersions.html).

### `PortalsLoreRecovery`

Create only after the owner supplies exact source resources, backup point,
isolated destination names, and a maximum spend. The
[recovery policy generator](../../infra/mac-bootstrap/scripts/lore-aws-recovery-policy.mjs)
produces an inline policy for all four exact production source tables and
four explicitly named `portals-restore-*` targets, plus read-only source S3
object-version access and write access to one precreated isolated restore
bucket. It grants no source writes, bucket creation, IAM, KMS, or cleanup
deletion. The account owner must inspect the result and the role trust policy;
the generated policy is not automatically installed. A separate, narrowly
scoped cleanup role or operator action removes the isolated targets after
evidence is secured. Apply an expiration tag and a session duration no longer
than the approved drill window. Do not enable PITR or create snapshots as
part of an unbounded test.

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

## Repeatable acceptance commands

After the account owner has installed the scoped role and configured a named
profile that assumes it, review the generated policy and run the read-only
inspection first. Set `LORE_AWS_REGION` and `LORE_AWS_BUCKET` from the
**verified live** configuration, and set `KNOWN_UNRELATED_TABLE` to an existing
table outside Lore's scope. Never use `default` or a broad administrative
profile. The scripts deliberately require the current reviewed bucket name
`portals-prod-lore-chunks`; if the live bucket differs, inspect the deployment
and revise the reviewed scripts before running a fixture.

```sh
node infra/mac-bootstrap/scripts/lore-aws-acceptance-policy.mjs \
  --region "$LORE_AWS_REGION" --bucket "$LORE_AWS_BUCKET"

node infra/mac-bootstrap/scripts/test-lore-aws-storage.mjs \
  --profile portals-lore-acceptance --region "$LORE_AWS_REGION" \
  --bucket "$LORE_AWS_BUCKET"
```

The second command checks the caller's account/role, S3 region, all four
table ARNs, ACTIVE state, and binary key schemas. With a named, known-existing
table outside the approved four, add `--deny-table <unrelated-table-name>`;
`ResourceNotFound` is **not** accepted as an authorization denial. Once read-only
inspection passes, add `--exercise` to put/read/delete one object and one item
per table, with automatic cleanup:

```sh
node infra/mac-bootstrap/scripts/test-lore-aws-storage.mjs \
  --profile portals-lore-acceptance --region "$LORE_AWS_REGION" \
  --bucket "$LORE_AWS_BUCKET" --deny-table "$KNOWN_UNRELATED_TABLE" --exercise
```

The script refuses a `default` profile and refuses any caller other than an
assumed `PortalsLoreAcceptanceReadWrite` role in account `168692731058`. It
does not print credentials, customer records, or object contents. The fixture
proves the separate acceptance role can use the expected stores; a second
run using Lore's actual workload identity is still required to prove the
runtime effective permissions. That second run needs a deliberately scoped
host-side action and should not export the long-lived workload key to the
developer machine.

Before restoring anything, record the exact source PITR timestamp or S3
version, target names, maximum temporary spend, cleanup owner, and RPO/RTO in
the drill record. AWS states that DynamoDB PITR creates a **new** table and
requires `RestoreTableToPointInTime` on the source plus read/write access to
the target; no production table should be replaced. Review any KMS key
requirements and target billing mode/capacity before granting recovery access.
[DynamoDB restore and IAM requirements](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/backuprestore_IAM.html).

When those values are known, set `ISOLATED_RESTORE_BUCKET` and
`ISOLATED_RESTORE_TABLE_PREFIX` to the agreed `portals-restore-*` names and
generate the separate recovery role policy for review. The source bucket is
named in the code but must be checked live; the target prefix forms four new
table names:

```sh
node infra/mac-bootstrap/scripts/lore-aws-recovery-policy.mjs \
  --region "$LORE_AWS_REGION" --source-bucket "$LORE_AWS_BUCKET" \
  --target-bucket "$ISOLATED_RESTORE_BUCKET" \
  --target-prefix "$ISOLATED_RESTORE_TABLE_PREFIX"
```

This policy alone is not a restore plan. Record the S3 version-selection
rule, prove the target bucket's encryption and public-access block, choose a
PITR time within the source's verified window, inspect target capacity/index
implications, and set the maximum spend before invoking a restore. The four
targets must be independently validated and then cleaned up under an approved
cleanup identity. No restore was invoked during this preparation.

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
