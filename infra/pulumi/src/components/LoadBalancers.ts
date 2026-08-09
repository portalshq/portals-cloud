import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { LoadBalancersArgs } from "../interfaces";

/**
 * LoadBalancers Component
 *
 * Creates load balancers with:
 * - Application Load Balancer (ALB) for HTTP traffic (Control Plane + Lore HTTP)
 * - Network Load Balancer (NLB) for TCP/UDP QUIC traffic (Lore QUIC)
 * - Target groups for each active service
 * - Security groups
 * - Listeners
 */
export class LoadBalancers extends pulumi.ComponentResource {
  public readonly alb: aws.lb.LoadBalancer;
  public readonly nlb: aws.lb.LoadBalancer;
  public readonly albSecurityGroup: aws.ec2.SecurityGroup;
  public readonly nlbSecurityGroup: aws.ec2.SecurityGroup;
  public readonly loreAlbTargetGroup: aws.lb.TargetGroup;
  public readonly loreNlbTargetGroup: aws.lb.TargetGroup;
  public readonly controlPlaneAlbTargetGroup: aws.lb.TargetGroup;

  constructor(name: string, args: LoadBalancersArgs, opts?: pulumi.ComponentResourceOptions) {
    super("portals:platform:LoadBalancers", name, {}, opts);

    const resourcePrefix = `${args.projectName}-${args.environment}`;

    // ── ALB Security Group ───────────────────────────────────────────────
    this.albSecurityGroup = new aws.ec2.SecurityGroup(`${resourcePrefix}-alb-sg`, {
      vpcId: args.vpcId,
      description: "Security group for Application Load Balancer",
      tags: {
        Name: `${resourcePrefix}-alb-sg`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    new aws.ec2.SecurityGroupRule(`${resourcePrefix}-alb-http-ingress`, {
      type: "ingress",
      fromPort: 80,
      toPort: 80,
      protocol: "tcp",
      securityGroupId: this.albSecurityGroup.id,
      cidrBlocks: ["0.0.0.0/0"],
    }, { parent: this });

    new aws.ec2.SecurityGroupRule(`${resourcePrefix}-alb-lore-ingress`, {
      type: "ingress",
      fromPort: 41339,
      toPort: 41339,
      protocol: "tcp",
      securityGroupId: this.albSecurityGroup.id,
      cidrBlocks: ["0.0.0.0/0"],
    }, { parent: this });

    // Control Plane listener on port 8083
    new aws.ec2.SecurityGroupRule(`${resourcePrefix}-alb-cp-ingress`, {
      type: "ingress",
      fromPort: 8083,
      toPort: 8083,
      protocol: "tcp",
      securityGroupId: this.albSecurityGroup.id,
      cidrBlocks: ["0.0.0.0/0"],
    }, { parent: this });

    // ── NLB Security Group ───────────────────────────────────────────────
    this.nlbSecurityGroup = new aws.ec2.SecurityGroup(`${resourcePrefix}-nlb-sg`, {
      vpcId: args.vpcId,
      description: "Security group for Network Load Balancer",
      tags: {
        Name: `${resourcePrefix}-nlb-sg`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    new aws.ec2.SecurityGroupRule(`${resourcePrefix}-nlb-quic-ingress`, {
      type: "ingress",
      fromPort: 41337,
      toPort: 41337,
      protocol: "udp",
      securityGroupId: this.nlbSecurityGroup.id,
      cidrBlocks: ["0.0.0.0/0"],
    }, { parent: this });

    // NLB also forwards TCP on 41337 (TCP_UDP listener)
    new aws.ec2.SecurityGroupRule(`${resourcePrefix}-nlb-tcp-ingress`, {
      type: "ingress",
      fromPort: 41337,
      toPort: 41337,
      protocol: "tcp",
      securityGroupId: this.nlbSecurityGroup.id,
      cidrBlocks: ["0.0.0.0/0"],
    }, { parent: this });

    // ── Application Load Balancer ────────────────────────────────────────
    this.alb = new aws.lb.LoadBalancer(`${resourcePrefix}-alb`, {
      internal: false,
      loadBalancerType: "application",
      securityGroups: [this.albSecurityGroup.id],
      subnets: args.publicSubnetIds,
      tags: {
        Name: `${resourcePrefix}-alb`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    // ── Network Load Balancer ────────────────────────────────────────────
    this.nlb = new aws.lb.LoadBalancer(`${resourcePrefix}-nlb`, {
      internal: false,
      loadBalancerType: "network",
      securityGroups: [this.nlbSecurityGroup.id],
      subnets: args.publicSubnetIds,
      tags: {
        Name: `${resourcePrefix}-nlb`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    // ── Lore ALB Target Group (HTTP on port 41339) ───────────────────────
    this.loreAlbTargetGroup = new aws.lb.TargetGroup(`${resourcePrefix}-lore-alb-tg`, {
      port: 41339,
      protocol: "HTTP",
      targetType: "ip",
      vpcId: args.vpcId,
      healthCheck: {
        enabled: true,
        path: "/health_check",
        port: "41339",
        protocol: "HTTP",
        healthyThreshold: 3,
        unhealthyThreshold: 3,
        timeout: 5,
        interval: 30,
        matcher: "200",
      },
      tags: {
        Name: `${resourcePrefix}-lore-alb-tg`,
        Project: args.projectName,
        Environment: args.environment,
        Service: "lore",
      },
    }, { parent: this });

    // ── Lore NLB Target Group (TCP_UDP on port 41337 for QUIC) ──────────
    this.loreNlbTargetGroup = new aws.lb.TargetGroup(`${resourcePrefix}-lore-nlb-tg`, {
      port: 41337,
      protocol: "TCP_UDP",
      targetType: "ip",
      vpcId: args.vpcId,
      preserveClientIp: "true",
      tags: {
        Name: `${resourcePrefix}-lore-nlb-tg`,
        Project: args.projectName,
        Environment: args.environment,
        Service: "lore",
      },
    }, { parent: this });

    // ── Control Plane ALB Target Group (port 8083) ──────────────────────
    this.controlPlaneAlbTargetGroup = new aws.lb.TargetGroup(`${resourcePrefix}-controlplane-alb-tg`, {
      name: `${resourcePrefix}-cp-tg`,
      port: 8083,
      protocol: "HTTP",
      targetType: "ip",
      vpcId: args.vpcId,
      healthCheck: {
        enabled: true,
        path: "/healthz",
        port: "8083",
        protocol: "HTTP",
        healthyThreshold: 3,
        unhealthyThreshold: 3,
        timeout: 5,
        interval: 30,
        matcher: "200",
      },
      tags: {
        Name: `${resourcePrefix}-controlplane-alb-tg`,
        Project: args.projectName,
        Environment: args.environment,
        Service: "control-plane",
      },
    }, { parent: this });

    // ── ALB Listeners ────────────────────────────────────────────────────

    // Default HTTP listener: 404 (no frontend in MVP)
    new aws.lb.Listener(`${resourcePrefix}-alb-http-listener`, {
      loadBalancerArn: this.alb.arn,
      port: 80,
      protocol: "HTTP",
      defaultActions: [
        {
          type: "fixed-response",
          fixedResponse: {
            contentType: "text/plain",
            statusCode: "404",
            messageBody: "Not Found",
          },
        },
      ],
    }, { parent: this });

    // Lore HTTP listener on port 41339
    new aws.lb.Listener(`${resourcePrefix}-alb-lore-listener`, {
      loadBalancerArn: this.alb.arn,
      port: 41339,
      protocol: "HTTP",
      defaultActions: [
        {
          type: "forward",
          targetGroupArn: this.loreAlbTargetGroup.arn,
        },
      ],
    }, { parent: this });

    // Control Plane listener on port 8083
    new aws.lb.Listener(`${resourcePrefix}-alb-controlplane-listener`, {
      loadBalancerArn: this.alb.arn,
      port: 8083,
      protocol: "HTTP",
      defaultActions: [
        {
          type: "forward",
          targetGroupArn: this.controlPlaneAlbTargetGroup.arn,
        },
      ],
    }, { parent: this });

    // ── NLB Listener ─────────────────────────────────────────────────────

    // Lore QUIC (TCP_UDP on port 41337)
    new aws.lb.Listener(`${resourcePrefix}-nlb-lore-listener`, {
      loadBalancerArn: this.nlb.arn,
      port: 41337,
      protocol: "TCP_UDP",
      defaultActions: [
        {
          type: "forward",
          targetGroupArn: this.loreNlbTargetGroup.arn,
        },
      ],
    }, { parent: this });

    this.registerOutputs();
  }
}
