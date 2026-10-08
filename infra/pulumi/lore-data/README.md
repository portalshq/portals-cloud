# Lore data stack

This is the separately selectable Pulumi project for Lore's durable storage:

- private, encrypted, versioned S3 chunk bucket and its TLS-only bucket policy;
- four provisioned-capacity DynamoDB tables, including the lock-table GSIs;
- a managed IAM policy granting Lore's task role only the required S3 and
  DynamoDB actions.

The target account is pinned to `168692731058` and region `us-east-2` in
`Pulumi.prod.yaml`. The program also checks the live AWS caller identity and
fails closed if it does not match. The S3 name includes the account ID to reduce
global-name collisions; confirm availability before applying.

## Preview

From this directory, authenticate Pulumi to the configured organization and
configure AWS credentials for account `168692731058`. Do not paste credentials
into repository files or chat.

```bash
aws sts get-caller-identity --region us-east-2
npm install
pulumi --stack DigitalCreationsCo/portals-lore-data/prod preview --diff
```

The initial preview should create only this stack's S3 bucket/configuration,
four DynamoDB tables, and one IAM managed policy. Review the account ID, region,
bucket name, table billing/PITR settings, and every proposed operation before
applying. This project does not import or move state from the former account.

`pulumi up` is intentionally not part of the bootstrap script: apply only after
the preview is reviewed and the bucket name is confirmed available.

## Service integration

The stack exports the bucket/table names and ARNs plus
`loreTaskAccessPolicyArn`. A platform stack in the same target AWS account can
read those outputs using a Pulumi `StackReference` and attach the managed policy
to Lore's ECS task role. Do not attach that policy to a role in another AWS
account. The existing `portals-platform/prod` state is from the former account;
it is not moved or imported by this project.
