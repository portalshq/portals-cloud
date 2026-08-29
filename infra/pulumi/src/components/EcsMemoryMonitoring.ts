import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export interface EcsMemoryMonitoringArgs {
  readonly projectName: string;
  readonly environment: string;
  readonly clusterName: pulumi.Input<string>;
  readonly serviceName: pulumi.Input<string>;
  readonly taskMemoryMb: number;
  readonly alarmNotificationTopicArn: pulumi.Input<string>;
}

/** Memory-utilization alarm plus a direct alert for ECS OOM task stops. */
export class EcsMemoryMonitoring extends pulumi.ComponentResource {
  constructor(name: string, args: EcsMemoryMonitoringArgs, opts?: pulumi.ComponentResourceOptions) {
    super("portals:observability:EcsMemoryMonitoring", name, {}, opts);
    const prefix = `${args.projectName}-${args.environment}`;
    new aws.cloudwatch.MetricAlarm(`${prefix}-${name}-memory-high`, {
      comparisonOperator: "GreaterThanThreshold",
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      metricName: "MemoryUtilization",
      namespace: "AWS/ECS",
      period: 60,
      statistic: "Average",
      threshold: 80,
      treatMissingData: "notBreaching",
      dimensions: { ClusterName: args.clusterName, ServiceName: args.serviceName },
      alarmDescription: `ECS service is above 80% of its ${args.taskMemoryMb} MiB memory reservation`,
      alarmActions: [args.alarmNotificationTopicArn],
      tags: { Project: args.projectName, Environment: args.environment, Purpose: "memory-capacity" },
    }, { parent: this });

    const oomRule = new aws.cloudwatch.EventRule(`${prefix}-${name}-oom`, {
      description: "Alert when this ECS service stops a task because of an out-of-memory condition",
      eventPattern: pulumi.all([args.serviceName]).apply(([serviceName]) => JSON.stringify({
        source: ["aws.ecs"],
        "detail-type": ["ECS Task State Change"],
        detail: {
          group: [`service:${serviceName}`],
          lastStatus: ["STOPPED"],
          stopCode: ["OutOfMemoryError"],
        },
      })),
    }, { parent: this });
    new aws.cloudwatch.EventTarget(`${prefix}-${name}-oom-alert`, {
      rule: oomRule.name,
      targetId: "sns-oom-alert",
      arn: args.alarmNotificationTopicArn,
    }, { parent: this });
    const exit137Rule = new aws.cloudwatch.EventRule(`${prefix}-${name}-exit-137`, {
      description: "Alert when this ECS service exits a container with the common OOM exit code 137",
      eventPattern: pulumi.all([args.serviceName]).apply(([serviceName]) => JSON.stringify({
        source: ["aws.ecs"],
        "detail-type": ["ECS Task State Change"],
        detail: {
          group: [`service:${serviceName}`],
          lastStatus: ["STOPPED"],
          containers: { exitCode: [137] },
        },
      })),
    }, { parent: this });
    new aws.cloudwatch.EventTarget(`${prefix}-${name}-exit-137-alert`, {
      rule: exit137Rule.name,
      targetId: "sns-exit-137-alert",
      arn: args.alarmNotificationTopicArn,
    }, { parent: this });
    this.registerOutputs();
  }
}

export class EcsHostMemoryMonitoring extends pulumi.ComponentResource {
  constructor(name: string, args: {
    readonly projectName: string;
    readonly environment: string;
    readonly autoScalingGroupName: pulumi.Input<string>;
    readonly alarmNotificationTopicArn: pulumi.Input<string>;
  }, opts?: pulumi.ComponentResourceOptions) {
    super("portals:observability:EcsHostMemoryMonitoring", name, {}, opts);
    const prefix = `${args.projectName}-${args.environment}`;
    new aws.cloudwatch.MetricAlarm(`${prefix}-${name}-memory-high`, {
      comparisonOperator: "GreaterThanThreshold",
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      metricName: "mem_used_percent",
      namespace: "Portals/ECSHost",
      period: 60,
      statistic: "Average",
      threshold: 80,
      treatMissingData: "breaching",
      dimensions: { AutoScalingGroupName: args.autoScalingGroupName },
      alarmDescription: "The single ECS host is above 80% memory utilization",
      alarmActions: [args.alarmNotificationTopicArn],
      tags: { Project: args.projectName, Environment: args.environment, Purpose: "host-memory-capacity" },
    }, { parent: this });
    this.registerOutputs();
  }
}
