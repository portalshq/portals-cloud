import * as path from "node:path";
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export interface LowCostRdsBackupsArgs {
  readonly projectName: string;
  readonly environment: string;
  readonly databaseInstanceId: pulumi.Input<string>;
  readonly databaseInstanceArn: pulumi.Input<string>;
  readonly retentionCount: number;
  readonly alarmNotificationTopicArn?: pulumi.Input<string>;
}

/**
 * One encrypted native RDS snapshot per day, with bounded generation pruning.
 * The Lambda calls only the RDS control-plane API and therefore needs no VPC,
 * NAT gateway, database password, or continuously running backup container.
 */
export class LowCostRdsBackups extends pulumi.ComponentResource {
  constructor(name: string, args: LowCostRdsBackupsArgs, opts?: pulumi.ComponentResourceOptions) {
    super("portals:recovery:LowCostRdsBackups", name, {}, opts);
    if (!Number.isInteger(args.retentionCount) || args.retentionCount < 7 || args.retentionCount > 35) {
      throw new pulumi.ResourceError("manual RDS snapshot retention must be between 7 and 35", this);
    }

    const prefix = `${args.projectName}-${args.environment}`;
    const account = aws.getCallerIdentityOutput({});
    const region = aws.getRegionOutput({});
    const snapshotArn = pulumi.interpolate`arn:aws:rds:${region.name}:${account.accountId}:snapshot:${prefix}-scheduled-*`;

    const logGroup = new aws.cloudwatch.LogGroup(`${prefix}-rds-backup`, {
      name: `/aws/lambda/${prefix}-rds-backup`,
      retentionInDays: 14,
      tags: { Project: args.projectName, Environment: args.environment, Purpose: "recovery" },
    }, { parent: this });

    const lambdaRole = new aws.iam.Role(`${prefix}-rds-backup`, {
      assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: "lambda.amazonaws.com" }),
      tags: { Project: args.projectName, Environment: args.environment, Purpose: "recovery" },
    }, { parent: this });
    new aws.iam.RolePolicy(`${prefix}-rds-backup`, {
      role: lambdaRole.id,
      policy: pulumi.all([args.databaseInstanceArn, snapshotArn, logGroup.arn]).apply(
        ([databaseArn, managedSnapshotArn, logArn]) => JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Sid: "ManageOnlyScheduledPortalsSnapshots",
              Effect: "Allow",
              Action: ["rds:CreateDBSnapshot", "rds:DeleteDBSnapshot", "rds:AddTagsToResource"],
              Resource: [databaseArn, managedSnapshotArn],
            },
            {
              Sid: "InventoryManualSnapshots",
              Effect: "Allow",
              Action: "rds:DescribeDBSnapshots",
              Resource: "*",
            },
            {
              Sid: "WriteBoundedBackupLogs",
              Effect: "Allow",
              Action: ["logs:CreateLogStream", "logs:PutLogEvents"],
              Resource: `${logArn}:*`,
            },
          ],
        }),
      ),
    }, { parent: this });

    const fn = new aws.lambda.Function(`${prefix}-rds-backup`, {
      name: `${prefix}-rds-backup`,
      role: lambdaRole.arn,
      runtime: "nodejs20.x",
      handler: "index.handler",
      architectures: ["arm64"],
      memorySize: 128,
      timeout: 60,
      code: new pulumi.asset.AssetArchive({
        "index.mjs": new pulumi.asset.FileAsset(
          path.join(__dirname, "../../lambda/rds-snapshot/index.mjs"),
        ),
      }),
      environment: {
        variables: {
          DATABASE_INSTANCE_ID: args.databaseInstanceId,
          SNAPSHOT_PREFIX: `${prefix}-scheduled`,
          RETENTION_COUNT: String(args.retentionCount),
        },
      },
      tags: { Project: args.projectName, Environment: args.environment, Purpose: "recovery" },
    }, { parent: this, dependsOn: logGroup });

    const schedulerRole = new aws.iam.Role(`${prefix}-rds-backup-scheduler`, {
      assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: "scheduler.amazonaws.com" }),
      tags: { Project: args.projectName, Environment: args.environment, Purpose: "recovery" },
    }, { parent: this });
    new aws.iam.RolePolicy(`${prefix}-rds-backup-scheduler`, {
      role: schedulerRole.id,
      policy: fn.arn.apply(arn => JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Action: "lambda:InvokeFunction", Resource: arn }],
      })),
    }, { parent: this });

    new aws.scheduler.Schedule(`${prefix}-rds-backup`, {
      name: `${prefix}-rds-backup-daily`,
      description: "Daily bounded native RDS snapshot for low-cost production recovery",
      scheduleExpression: "cron(17 5 * * ? *)",
      scheduleExpressionTimezone: "UTC",
      flexibleTimeWindow: { mode: "FLEXIBLE", maximumWindowInMinutes: 60 },
      target: {
        arn: fn.arn,
        roleArn: schedulerRole.arn,
        retryPolicy: { maximumEventAgeInSeconds: 3600, maximumRetryAttempts: 2 },
      },
      state: "ENABLED",
    }, { parent: this });

    new aws.cloudwatch.MetricAlarm(`${prefix}-rds-backup-errors`, {
      comparisonOperator: "GreaterThanThreshold",
      evaluationPeriods: 1,
      metricName: "Errors",
      namespace: "AWS/Lambda",
      period: 86400,
      statistic: "Sum",
      threshold: 0,
      treatMissingData: "notBreaching",
      dimensions: { FunctionName: fn.name },
      alarmDescription: "The daily RDS recovery snapshot automation failed",
      alarmActions: args.alarmNotificationTopicArn ? [args.alarmNotificationTopicArn] : undefined,
      tags: { Project: args.projectName, Environment: args.environment, Purpose: "recovery" },
    }, { parent: this });

    new aws.cloudwatch.MetricAlarm(`${prefix}-rds-backup-missing`, {
      comparisonOperator: "LessThanThreshold",
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      metricName: "Invocations",
      namespace: "AWS/Lambda",
      period: 86400,
      statistic: "Sum",
      threshold: 1,
      treatMissingData: "breaching",
      dimensions: { FunctionName: fn.name },
      alarmDescription: "No scheduled RDS recovery snapshot ran for two consecutive days",
      alarmActions: args.alarmNotificationTopicArn ? [args.alarmNotificationTopicArn] : undefined,
      tags: { Project: args.projectName, Environment: args.environment, Purpose: "recovery" },
    }, { parent: this });

    this.registerOutputs({ functionName: fn.name, retentionCount: args.retentionCount });
  }
}
