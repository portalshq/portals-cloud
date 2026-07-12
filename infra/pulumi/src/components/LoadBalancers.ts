import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { LoadBalancersArgs } from "../interfaces";

/**
 * LoadBalancers Component
 * 
 * Creates load balancers with:
 * - Application Load Balancer (ALB) for HTTP traffic
 * - Network Load Balancer (NLB) for TCP/UDP QUIC traffic
 * - Target groups for each service
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
  public readonly serverAlbTargetGroup: aws.lb.TargetGroup;
  public readonly frontendAlbTargetGroup: aws.lb.TargetGroup;

  constructor(name: string, args: LoadBalancersArgs, opts?: pulumi.ComponentResourceOptions) {
    super("portals:platform:LoadBalancers", name, {}, opts);

    const resourcePrefix = `${args.projectName}-${args.environment}`;

    // Create ALB Security Group
    this.albSecurityGroup = new aws.ec2.SecurityGroup(`${resourcePrefix}-alb-sg`, {
      vpcId: args.vpcId,
      description: "Security group for Application Load Balancer",
      tags: {
        Name: `${resourcePrefix}-alb-sg`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    // Allow HTTP traffic to ALB
    new aws.ec2.SecurityGroupRule(`${resourcePrefix}-alb-http-ingress`, {
      type: "ingress",
      fromPort: 80,
      toPort: 80,
      protocol: "tcp",
      securityGroupId: this.albSecurityGroup.id,
      cidrBlocks: ["0.0.0.0/0"],
    }, { parent: this });

    // Allow HTTPS traffic to ALB
    new aws.ec2.SecurityGroupRule(`${resourcePrefix}-alb-https-ingress`, {
      type: "ingress",
      fromPort: 443,
      toPort: 443,
      protocol: "tcp",
      securityGroupId: this.albSecurityGroup.id,
      cidrBlocks: ["0.0.0.0/0"],
    }, { parent: this });

    // Create NLB Security Group
    this.nlbSecurityGroup = new aws.ec2.SecurityGroup(`${resourcePrefix}-nlb-sg`, {
      vpcId: args.vpcId,
      description: "Security group for Network Load Balancer",
      tags: {
        Name: `${resourcePrefix}-nlb-sg`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    // Allow QUIC traffic to NLB (port 41337)
    new aws.ec2.SecurityGroupRule(`${resourcePrefix}-nlb-quic-ingress`, {
      type: "ingress",
      fromPort: 41337,
      toPort: 41337,
      protocol: "udp",
      securityGroupId: this.nlbSecurityGroup.id,
      cidrBlocks: ["0.0.0.0/0"],
    }, { parent: this });

    // Create Application Load Balancer
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

    // Create Network Load Balancer
    this.nlb = new aws.lb.LoadBalancer(`${resourcePrefix}-nlb`, {
      internal: false,
      loadBalancerType: "network",
      subnets: args.publicSubnetIds,
      tags: {
        Name: `${resourcePrefix}-nlb`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    // Create ALB target group for Lore service (HTTP on port 41339)
    this.loreAlbTargetGroup = new aws.lb.TargetGroup(`${resourcePrefix}-lore-alb-tg`, {
      port: 41339,
      protocol: "HTTP",
      targetType: "ip",
      vpcId: args.vpcId,
      tags: {
        Name: `${resourcePrefix}-lore-alb-tg`,
        Project: args.projectName,
        Environment: args.environment,
        Service: "lore",
      },
    }, { parent: this });

    // Create NLB target group for Lore service (TCP/UDP QUIC on port 41337)
    this.loreNlbTargetGroup = new aws.lb.TargetGroup(`${resourcePrefix}-lore-nlb-tg`, {
      port: 41337,
      protocol: "TCP_UDP",
      targetType: "ip",
      vpcId: args.vpcId,
      tags: {
        Name: `${resourcePrefix}-lore-nlb-tg`,
        Project: args.projectName,
        Environment: args.environment,
        Service: "lore",
      },
    }, { parent: this });

    // Create ALB target group for Server service
    this.serverAlbTargetGroup = new aws.lb.TargetGroup(`${resourcePrefix}-server-alb-tg`, {
      port: 80,
      protocol: "HTTP",
      targetType: "ip",
      vpcId: args.vpcId,
      tags: {
        Name: `${resourcePrefix}-server-alb-tg`,
        Project: args.projectName,
        Environment: args.environment,
        Service: "server",
      },
    }, { parent: this });

    // Create ALB target group for Frontend service
    this.frontendAlbTargetGroup = new aws.lb.TargetGroup(`${resourcePrefix}-frontend-alb-tg`, {
      port: 80,
      protocol: "HTTP",
      targetType: "ip",
      vpcId: args.vpcId,
      tags: {
        Name: `${resourcePrefix}-frontend-alb-tg`,
        Project: args.projectName,
        Environment: args.environment,
        Service: "frontend",
      },
    }, { parent: this });

    // Create ALB listener for HTTP (port 80)
    new aws.lb.Listener(`${resourcePrefix}-alb-http-listener`, {
      loadBalancerArn: this.alb.arn,
      port: 80,
      protocol: "HTTP",
      defaultActions: [
        {
          type: "forward",
          targetGroupArn: this.frontendAlbTargetGroup.arn,
        },
      ],
    }, { parent: this });

    // Create ALB listener for Lore service on port 41339
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

    // Create NLB listener for Lore service on port 41337
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
