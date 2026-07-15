import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { PlatformEventBusArgs } from "../interfaces";

/**
 * PlatformEventBus Component
 * 
 * Creates an SQS-based event bus with:
 * - Main SQS queue for events
 * - Dead-letter queue for failed events
 * - IAM policy for ECS task access
 * - Security group rules
 */
export class PlatformEventBus extends pulumi.ComponentResource {
  public readonly queue: aws.sqs.Queue;
  public readonly deadLetterQueue: aws.sqs.Queue;
  public readonly queueUrl: pulumi.Output<string>;
  public readonly queueArn: pulumi.Output<string>;
  public readonly deadLetterQueueUrl: pulumi.Output<string>;
  public readonly deadLetterQueueArn: pulumi.Output<string>;
  public readonly iamPolicy: aws.iam.Policy;
  public readonly securityGroup: aws.ec2.SecurityGroup;

  constructor(name: string, args: PlatformEventBusArgs, opts?: pulumi.ComponentResourceOptions) {
    super("portals:platform:EventBus", name, {}, opts);

    const resourcePrefix = `${args.projectName}-${args.environment}`;

    // Create Dead-Letter Queue for failed events
    this.deadLetterQueue = new aws.sqs.Queue(`${resourcePrefix}-events-dlq`, {
      name: `${resourcePrefix}-events-dlq`,
      messageRetentionSeconds: 1209600, // 14 days
      tags: {
        Name: `${resourcePrefix}-events-dlq`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    // Create main event queue with DLQ redrive policy
    this.queue = new aws.sqs.Queue(`${resourcePrefix}-events`, {
      name: `${resourcePrefix}-events`,
      messageRetentionSeconds: 86400, // 1 day
      visibilityTimeoutSeconds: 300, // 5 minutes
      redrivePolicy: pulumi.interpolate`{
        "deadLetterTargetArn": "${this.deadLetterQueue.arn}",
        "maxReceiveCount": 5
      }`,
      tags: {
        Name: `${resourcePrefix}-events`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    // Create security group for event bus access
    this.securityGroup = new aws.ec2.SecurityGroup(`${resourcePrefix}-events-sg`, {
      vpcId: args.vpcId,
      description: "Security group for event bus access",
      tags: {
        Name: `${resourcePrefix}-events-sg`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    // Allow ingress from ECS tasks to SQS (via VPC endpoints)
    new aws.ec2.SecurityGroupRule(`${resourcePrefix}-events-egress`, {
      type: "egress",
      fromPort: 0,
      toPort: 0,
      protocol: "-1",
      securityGroupId: this.securityGroup.id,
      cidrBlocks: ["0.0.0.0/0"],
    }, { parent: this });

    // Create IAM policy for ECS tasks to access SQS
    this.iamPolicy = new aws.iam.Policy(`${resourcePrefix}-events-policy`, {
      description: "IAM policy for control-plane to access SQS event bus",
      policy: pulumi.interpolate`{
        "Version": "2012-10-17",
        "Statement": [
          {
            "Effect": "Allow",
            "Action": [
              "sqs:SendMessage",
              "sqs:ReceiveMessage",
              "sqs:DeleteMessage",
              "sqs:GetQueueAttributes",
              "sqs:ChangeMessageVisibility"
            ],
            "Resource": [
              "${this.queue.arn}",
              "${this.deadLetterQueue.arn}"
            ]
          }
        ]
      }`,
      tags: {
        Name: `${resourcePrefix}-events-policy`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    // Export queue URLs and ARNs
    this.queueUrl = this.queue.url;
    this.queueArn = this.queue.arn;
    this.deadLetterQueueUrl = this.deadLetterQueue.url;
    this.deadLetterQueueArn = this.deadLetterQueue.arn;

    this.registerOutputs();
  }
}
