import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export interface SecurityControlsArgs {
  readonly enabled: boolean;
  readonly projectName: string;
  readonly environment: string;
  readonly vpcId: pulumi.Input<string>;
  readonly threatDetectionEnabled: boolean;
  /** When set, provisions the alarm SNS topic and an email subscription. */
  readonly notificationEndpoint?: string;
}

/** Account/VPC audit baseline. Paid managed threat detection is optional. */
export class SecurityControls extends pulumi.ComponentResource {
  public readonly auditBucket?: aws.s3.Bucket;
  /** Set when notificationEndpoint is provided; wire into alarm actions. */
  public readonly alertTopic?: aws.sns.Topic;

  constructor(name: string, args: SecurityControlsArgs, opts?: pulumi.ComponentResourceOptions) {
    super("portals:security:SecurityControls", name, {}, opts);
    if (!args.enabled) {
      this.registerOutputs({ enabled: false });
      return;
    }

    const prefix = `${args.projectName}-${args.environment}`;
    const account = aws.getCallerIdentityOutput({});

    // Account-level external-access analysis is part of the no-additional-cost
    // baseline. Do not use the paid UNUSED_ACCESS analyzer type here.
    // Account quota is 1 analyzer of type ACCOUNT — the existing
    // `portals-dev-external-access` already covers the account (prod reuses it).
    // Creating `portals-prod-external-access` would hit ServiceQuotaExceeded.
    if (args.environment !== "prod") {
      new aws.accessanalyzer.Analyzer(`${prefix}-external-access`, {
        analyzerName: `${prefix}-external-access`,
        type: "ACCOUNT",
        tags: { Project: args.projectName, Environment: args.environment },
      }, { parent: this, protect: args.environment === "prod" });
    }
    const auditBucket = new aws.s3.Bucket(`${prefix}-audit`, {
      forceDestroy: false,
      tags: { Project: args.projectName, Environment: args.environment, Purpose: "security-audit" },
    }, { parent: this, protect: args.environment === "prod" });
    this.auditBucket = auditBucket;

    new aws.s3.BucketPublicAccessBlock(`${prefix}-audit-public-block`, {
      bucket: auditBucket.id,
      blockPublicAcls: true,
      blockPublicPolicy: true,
      ignorePublicAcls: true,
      restrictPublicBuckets: true,
    }, { parent: this });
    new aws.s3.BucketVersioningV2(`${prefix}-audit-versioning`, {
      bucket: auditBucket.id,
      versioningConfiguration: { status: "Enabled" },
    }, { parent: this });
    new aws.s3.BucketServerSideEncryptionConfigurationV2(`${prefix}-audit-encryption`, {
      bucket: auditBucket.id,
      rules: [{ applyServerSideEncryptionByDefault: { sseAlgorithm: "AES256" } }],
    }, { parent: this });

    const bucketPolicy = pulumi.all([auditBucket.arn, account.accountId]).apply(([arn, accountId]) => JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "DenyInsecureTransport",
          Effect: "Deny",
          Principal: "*",
          Action: "s3:*",
          Resource: [arn, `${arn}/*`],
          Condition: { Bool: { "aws:SecureTransport": "false" } },
        },
        {
          Sid: "CloudTrailAclCheck",
          Effect: "Allow",
          Principal: { Service: "cloudtrail.amazonaws.com" },
          Action: "s3:GetBucketAcl",
          Resource: arn,
        },
        {
          Sid: "CloudTrailWrite",
          Effect: "Allow",
          Principal: { Service: "cloudtrail.amazonaws.com" },
          Action: "s3:PutObject",
          Resource: `${arn}/cloudtrail/AWSLogs/${accountId}/*`,
          Condition: { StringEquals: { "s3:x-amz-acl": "bucket-owner-full-control" } },
        },
        {
          Sid: "AlbLogWrite",
          Effect: "Allow",
          Principal: { Service: "logdelivery.elasticloadbalancing.amazonaws.com" },
          Action: "s3:PutObject",
          Resource: `${arn}/alb/AWSLogs/${accountId}/*`,
        },
      ],
    }));
    const policy = new aws.s3.BucketPolicy(`${prefix}-audit-policy`, {
      bucket: auditBucket.id,
      policy: bucketPolicy,
    }, { parent: this });

    new aws.cloudtrail.Trail(`${prefix}-trail`, {
      name: `${prefix}-security-trail`,
      s3BucketName: auditBucket.id,
      s3KeyPrefix: "cloudtrail",
      enableLogFileValidation: true,
      includeGlobalServiceEvents: true,
      isMultiRegionTrail: true,
      enableLogging: true,
      eventSelectors: [{
        includeManagementEvents: true,
        readWriteType: "All",
      }],
      tags: { Project: args.projectName, Environment: args.environment },
    }, { parent: this, dependsOn: policy });

    const flowLogGroup = new aws.cloudwatch.LogGroup(`${prefix}-vpc-flow`, {
      retentionInDays: args.environment === "prod" ? 365 : 30,
      tags: { Project: args.projectName, Environment: args.environment },
    }, { parent: this });
    const flowRole = new aws.iam.Role(`${prefix}-vpc-flow`, {
      assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: "vpc-flow-logs.amazonaws.com" }),
      tags: { Project: args.projectName, Environment: args.environment },
    }, { parent: this });
    new aws.iam.RolePolicy(`${prefix}-vpc-flow`, {
      role: flowRole.id,
      policy: flowLogGroup.arn.apply(arn => JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
          Effect: "Allow",
          Action: ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogGroups", "logs:DescribeLogStreams"],
          Resource: `${arn}:*`,
        }],
      })),
    }, { parent: this });
    new aws.ec2.FlowLog(`${prefix}-vpc-flow`, {
      vpcId: args.vpcId,
      trafficType: "ALL",
      logDestinationType: "cloud-watch-logs",
      logDestination: flowLogGroup.arn,
      iamRoleArn: flowRole.arn,
      maxAggregationInterval: 60,
      tags: { Project: args.projectName, Environment: args.environment },
    }, { parent: this });

    if (args.threatDetectionEnabled) {
      new aws.guardduty.Detector(`${prefix}-guardduty`, {
        enable: true,
        findingPublishingFrequency: "FIFTEEN_MINUTES",
        datasources: { s3Logs: { enable: true } },
        tags: { Project: args.projectName, Environment: args.environment },
      }, { parent: this });
      new aws.securityhub.Account(`${prefix}-securityhub`, {
        enableDefaultStandards: true,
        controlFindingGenerator: "SECURITY_CONTROL",
        autoEnableControls: true,
      }, { parent: this });
    }

    if (args.notificationEndpoint) {
      this.alertTopic = new aws.sns.Topic(`${prefix}-alerts`, {
        name: `${prefix}-alerts`,
        tags: { Project: args.projectName, Environment: args.environment, Purpose: "alarm-notifications" },
      }, { parent: this });
      // CloudWatch alarms publish to this topic; without the topic-policy
      // statement every alarmAction delivery fails with authorization errors.
      new aws.sns.TopicPolicy(`${prefix}-alerts-policy`, {
        arn: this.alertTopic.arn,
        policy: pulumi.all([this.alertTopic.arn]).apply(([arn]) => JSON.stringify({
          Version: "2012-10-17",
          Statement: [{
            Sid: "AllowCloudWatchAlarmPublish",
            Effect: "Allow",
            Principal: { Service: "cloudwatch.amazonaws.com" },
            Action: "sns:Publish",
            Resource: arn,
            Condition: { StringEquals: { "AWS:SourceArn": arn } },
          }],
        })),
      }, { parent: this });
      new aws.sns.TopicSubscription(`${prefix}-alerts-email`, {
        topic: this.alertTopic.arn,
        protocol: "email",
        endpoint: args.notificationEndpoint,
      }, { parent: this });
    }

    this.registerOutputs({
      enabled: true,
      threatDetectionEnabled: args.threatDetectionEnabled,
      auditBucketName: auditBucket.id,
    });
  }
}
