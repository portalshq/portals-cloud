import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { LoadBalancersArgs } from "../interfaces";

/**
 * Public edge for Lore.
 *
 * The edge is fail-closed by default.  When explicitly enabled it exposes only
 * TLS/HTTP2 on port 443 and forwards to private Lore/Auth Gateway target groups
 * over plaintext HTTP variants inside the VPC. The retired issuer has no public
 * listener and QUIC/direct Lore ports are not provisioned. See ADR 0006 for the
 * bounded residual risk and the backend-TLS migration trigger.
 */
export class LoadBalancers extends pulumi.ComponentResource {
  public readonly alb: aws.lb.LoadBalancer;
  public readonly albSecurityGroup: aws.ec2.SecurityGroup;
  public readonly loreGrpcTargetGroup: aws.lb.TargetGroup;
  public readonly authGrpcTargetGroup: aws.lb.TargetGroup;
  public readonly authHttpTargetGroup: aws.lb.TargetGroup;

  constructor(name: string, args: LoadBalancersArgs, opts?: pulumi.ComponentResourceOptions) {
    super("portals:platform:LoadBalancers", name, {}, opts);

    const resourcePrefix = `${args.projectName}-${args.environment}`;

    const edgeEnabled = args.publicIngressEnabled || args.jwksPublicationEnabled;
    if (edgeEnabled && !args.certificateArn) {
      throw new pulumi.ResourceError(
        "an enabled edge requires an ACM certificate ARN; refusing to create a plaintext edge",
        this,
      );
    }

    this.albSecurityGroup = new aws.ec2.SecurityGroup(`${resourcePrefix}-alb-sg`, {
      vpcId: args.vpcId,
      description: "Fail-closed public edge; HTTPS 443 only when explicitly enabled",
      revokeRulesOnDelete: true,
      tags: {
        Name: `${resourcePrefix}-alb-sg`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    let webAcl: aws.wafv2.WebAcl | undefined;
    if (edgeEnabled) {
      new aws.ec2.SecurityGroupRule(`${resourcePrefix}-alb-https-ingress`, {
        type: "ingress",
        fromPort: 443,
        toPort: 443,
        protocol: "tcp",
        securityGroupId: this.albSecurityGroup.id,
        cidrBlocks: args.allowedIngressCidrs,
        description: "Public Lore gRPC over TLS",
      }, { parent: this });
    }

    new aws.ec2.SecurityGroupRule(`${resourcePrefix}-alb-lore-egress`, {
      type: "egress",
      fromPort: 41337,
      toPort: 41337,
      protocol: "tcp",
      securityGroupId: this.albSecurityGroup.id,
      cidrBlocks: [args.vpcCidr],
      description: "ALB to Lore gRPC targets only",
    }, { parent: this });

    for (const port of [8084, 8085]) {
      new aws.ec2.SecurityGroupRule(`${resourcePrefix}-alb-auth-${port}-egress`, {
        type: "egress", fromPort: port, toPort: port, protocol: "tcp",
        securityGroupId: this.albSecurityGroup.id, cidrBlocks: [args.vpcCidr],
        description: "ALB to Auth Gateway only",
      }, { parent: this });
    }

    this.alb = new aws.lb.LoadBalancer(`${resourcePrefix}-alb`, {
      internal: false,
      loadBalancerType: "application",
      securityGroups: [this.albSecurityGroup.id],
      subnets: args.publicSubnetIds,
      dropInvalidHeaderFields: true,
      enableDeletionProtection: args.deletionProtectionEnabled,
      accessLogs: args.accessLogsBucket
        ? { bucket: args.accessLogsBucket, prefix: "alb", enabled: true }
        : undefined,
      tags: {
        Name: `${resourcePrefix}-alb`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    this.loreGrpcTargetGroup = new aws.lb.TargetGroup(`${resourcePrefix}-lore-grpc-tg`, {
      name: `${resourcePrefix}-lore-grpc`.substring(0, 32),
      port: 41337,
      protocol: "HTTP",
      protocolVersion: "GRPC",
      targetType: "ip",
      vpcId: args.vpcId,
      deregistrationDelay: 30,
      healthCheck: {
        enabled: true,
        path: "/grpc.health.v1.Health/Check",
        port: "traffic-port",
        protocol: "HTTP",
        healthyThreshold: 2,
        unhealthyThreshold: 2,
        timeout: 5,
        interval: 30,
        matcher: "0",
      },
      tags: {
        Name: `${resourcePrefix}-lore-grpc-tg`,
        Project: args.projectName,
        Environment: args.environment,
        Service: "lore",
      },
    }, { parent: this });

    this.authGrpcTargetGroup = new aws.lb.TargetGroup(`${resourcePrefix}-auth-grpc-tg`, {
      name: `${resourcePrefix}-auth-grpc`.substring(0, 32),
      port: 8084, protocol: "HTTP", protocolVersion: "GRPC", targetType: "ip", vpcId: args.vpcId,
      deregistrationDelay: 30,
      healthCheck: { enabled: true, path: "/grpc.health.v1.Health/Check", protocol: "HTTP", matcher: "0", interval: 30, timeout: 5, healthyThreshold: 2, unhealthyThreshold: 2 },
      tags: { Project: args.projectName, Environment: args.environment, Service: "auth-gateway" },
    }, { parent: this });
    this.authHttpTargetGroup = new aws.lb.TargetGroup(`${resourcePrefix}-auth-http-tg`, {
      name: `${resourcePrefix}-auth-http`.substring(0, 32),
      port: 8085, protocol: "HTTP", protocolVersion: "HTTP1", targetType: "ip", vpcId: args.vpcId,
      deregistrationDelay: 30,
      healthCheck: { enabled: true, path: "/healthz", protocol: "HTTP", matcher: "200", interval: 30, timeout: 5, healthyThreshold: 2, unhealthyThreshold: 2 },
      tags: { Project: args.projectName, Environment: args.environment, Service: "auth-gateway" },
    }, { parent: this });

    if (edgeEnabled) {
      const listener = new aws.lb.Listener(`${resourcePrefix}-alb-https-listener`, {
        loadBalancerArn: this.alb.arn,
        port: 443,
        protocol: "HTTPS",
        certificateArn: args.certificateArn,
        sslPolicy: "ELBSecurityPolicy-TLS13-1-2-2021-06",
        defaultActions: [{
          type: "fixed-response",
          fixedResponse: {
            contentType: "text/plain",
            statusCode: "404",
            messageBody: "Not Found",
          },
        }],
      }, { parent: this });

      if (args.publicIngressEnabled) {
        new aws.lb.ListenerRule(`${resourcePrefix}-lore-grpc-rule`, {
          listenerArn: listener.arn,
          priority: 100,
          actions: [{ type: "forward", targetGroupArn: this.loreGrpcTargetGroup.arn }],
          conditions: [{ hostHeader: { values: [args.loreHostname] } }],
        }, { parent: this });
      }

      new aws.lb.ListenerRule(`${resourcePrefix}-auth-http-rule`, {
        listenerArn: listener.arn, priority: 90,
        actions: [{ type: "forward", targetGroupArn: this.authHttpTargetGroup.arn }],
        conditions: [
          { hostHeader: { values: [args.authHostname] } },
          { pathPattern: { values: args.publicIngressEnabled
            ? ["/callback", "/.well-known/jwks.json", "/healthz"]
            : ["/.well-known/jwks.json", "/healthz"] } },
        ],
      }, { parent: this });
      if (args.publicIngressEnabled) {
        new aws.lb.ListenerRule(`${resourcePrefix}-auth-grpc-rule`, {
          listenerArn: listener.arn, priority: 110,
          actions: [{ type: "forward", targetGroupArn: this.authGrpcTargetGroup.arn }],
          conditions: [{ hostHeader: { values: [args.authHostname] } }],
        }, { parent: this });
      }

      webAcl = new aws.wafv2.WebAcl(`${resourcePrefix}-edge-waf`, {
        scope: "REGIONAL",
        defaultAction: { allow: {} },
        visibilityConfig: {
          cloudwatchMetricsEnabled: true,
          metricName: `${resourcePrefix}-edge-waf`,
          sampledRequestsEnabled: true,
        },
        rules: [
          {
            name: "AWSManagedIpReputation",
            priority: 5,
            overrideAction: { none: {} },
            statement: {
              managedRuleGroupStatement: {
                name: "AWSManagedRulesAmazonIpReputationList",
                vendorName: "AWS",
              },
            },
            visibilityConfig: {
              cloudwatchMetricsEnabled: true,
              metricName: `${resourcePrefix}-ip-reputation`,
              sampledRequestsEnabled: true,
            },
          },
          {
            name: "AWSManagedCommon",
            priority: 10,
            overrideAction: { none: {} },
            statement: {
              managedRuleGroupStatement: {
                name: "AWSManagedRulesCommonRuleSet",
                vendorName: "AWS",
                // Binary gRPC bodies are not compatible with the common HTTP
                // inspection rules (notably body-size checks). Apply this rule
                // group only to the three small browser-facing HTTP routes.
                scopeDownStatement: {
                  orStatement: {
                    statements: ["/callback", "/.well-known/jwks.json", "/healthz"].map(path => ({
                      byteMatchStatement: {
                        fieldToMatch: { uriPath: {} },
                        positionalConstraint: "EXACTLY",
                        searchString: path,
                        textTransformations: [{ priority: 0, type: "NONE" }],
                      },
                    })),
                  },
                },
              },
            },
            visibilityConfig: {
              cloudwatchMetricsEnabled: true,
              metricName: `${resourcePrefix}-common`,
              sampledRequestsEnabled: true,
            },
          },
          {
            name: "PerIpRateLimit",
            priority: 20,
            action: { block: {} },
            statement: { rateBasedStatement: { aggregateKeyType: "IP", limit: 2000 } },
            visibilityConfig: {
              cloudwatchMetricsEnabled: true,
              metricName: `${resourcePrefix}-rate`,
              sampledRequestsEnabled: true,
            },
          },
        ],
        tags: { Project: args.projectName, Environment: args.environment },
      }, { parent: this });

      new aws.wafv2.WebAclAssociation(`${resourcePrefix}-edge-waf-association`, {
        resourceArn: this.alb.arn,
        webAclArn: webAcl.arn,
      }, { parent: this });

      const wafLogs = new aws.cloudwatch.LogGroup(`${resourcePrefix}-waf-logs`, {
        name: `aws-waf-logs-${resourcePrefix}-edge`,
        retentionInDays: args.environment === "prod" ? 365 : 30,
        tags: { Project: args.projectName, Environment: args.environment },
      }, { parent: this });
      new aws.wafv2.WebAclLoggingConfiguration(`${resourcePrefix}-edge-waf-logs`, {
        resourceArn: webAcl.arn,
        logDestinationConfigs: [wafLogs.arn],
        redactedFields: [{ singleHeader: { name: "authorization" } }],
      }, { parent: this });
    }

    if (args.alarmsEnabled) {
      for (const [service, targetGroup, description] of [
        ["lore", this.loreGrpcTargetGroup, "Lore store-aware readiness"],
        ["auth-grpc", this.authGrpcTargetGroup, "Auth Gateway gRPC readiness"],
        ["auth-http", this.authHttpTargetGroup, "Auth Gateway HTTP readiness"],
      ] as const) {
        new aws.cloudwatch.MetricAlarm(`${resourcePrefix}-${service}-unhealthy-targets`, {
          comparisonOperator: "GreaterThanThreshold",
          evaluationPeriods: 2,
          metricName: "UnHealthyHostCount",
          namespace: "AWS/ApplicationELB",
          period: 60,
          statistic: "Maximum",
          threshold: 0,
          treatMissingData: "notBreaching",
          dimensions: {
            LoadBalancer: this.alb.arnSuffix,
            TargetGroup: targetGroup.arnSuffix,
          },
          alarmDescription: `${description} is failing for an ALB target`,
        alarmActions: args.alarmNotificationTopicArn ? [args.alarmNotificationTopicArn] : undefined,
          tags: { Project: args.projectName, Environment: args.environment },
        }, {
          parent: this,
          aliases: service === "lore"
            ? [{ name: `${resourcePrefix}-alb-unhealthy-targets`, parent: this }]
            : undefined,
        });
      }

      new aws.cloudwatch.MetricAlarm(`${resourcePrefix}-alb-5xx`, {
      comparisonOperator: "GreaterThanThreshold",
      evaluationPeriods: 2,
      metricName: "HTTPCode_ELB_5XX_Count",
      namespace: "AWS/ApplicationELB",
      period: 60,
      statistic: "Sum",
      threshold: 5,
      treatMissingData: "notBreaching",
      dimensions: { LoadBalancer: this.alb.arnSuffix },
      alarmDescription: "Lore public edge is returning elevated ALB 5xx errors",
      alarmActions: args.alarmNotificationTopicArn ? [args.alarmNotificationTopicArn] : undefined,
      tags: { Project: args.projectName, Environment: args.environment },
      }, { parent: this });

      new aws.cloudwatch.MetricAlarm(`${resourcePrefix}-target-4xx`, {
        comparisonOperator: "GreaterThanThreshold",
        evaluationPeriods: 2,
        metricName: "HTTPCode_Target_4XX_Count",
        namespace: "AWS/ApplicationELB",
        period: 300,
        statistic: "Sum",
        threshold: 50,
        treatMissingData: "notBreaching",
        dimensions: { LoadBalancer: this.alb.arnSuffix },
        alarmDescription: "The public edge is receiving elevated rejected or unauthorized requests",
        alarmActions: args.alarmNotificationTopicArn ? [args.alarmNotificationTopicArn] : undefined,
        tags: { Project: args.projectName, Environment: args.environment },
      }, { parent: this });

      if (webAcl) {
        new aws.cloudwatch.MetricAlarm(`${resourcePrefix}-waf-blocks`, {
          comparisonOperator: "GreaterThanThreshold",
          evaluationPeriods: 1,
          metricName: "BlockedRequests",
          namespace: "AWS/WAFV2",
          period: 300,
          statistic: "Sum",
          threshold: 100,
          treatMissingData: "notBreaching",
          dimensions: {
            WebACL: `${resourcePrefix}-edge-waf`,
            Region: aws.getRegionOutput({}).name,
            Rule: "ALL",
          },
          alarmDescription: "WAF is blocking an elevated request volume",
          alarmActions: args.alarmNotificationTopicArn ? [args.alarmNotificationTopicArn] : undefined,
          tags: { Project: args.projectName, Environment: args.environment },
        }, { parent: this });
      }
    }

    this.registerOutputs();
  }
}
