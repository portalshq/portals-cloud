import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { PlatformNetworkArgs } from "../interfaces";

/**
 * Single-purpose public VPC for the one-host ECS deployment. Workload reachability
 * is controlled by security groups; the subnet NACL is a stateless backstop.
 */
export class PlatformNetwork extends pulumi.ComponentResource {
  public readonly vpc: aws.ec2.Vpc;
  public readonly publicSubnets: aws.ec2.Subnet[];
  public readonly internetGateway: aws.ec2.InternetGateway;
  public readonly publicRouteTable: aws.ec2.RouteTable;
  public readonly publicNetworkAcl: aws.ec2.NetworkAcl;
  public readonly defaultSecurityGroup: aws.ec2.SecurityGroup;

  constructor(name: string, args: PlatformNetworkArgs, opts?: pulumi.ComponentResourceOptions) {
    super("portals:platform:Network", name, {}, opts);
    const prefix = `${args.projectName}-${args.environment}`;
    const availabilityZones = pulumi.output(args.availabilityZones);

    this.vpc = new aws.ec2.Vpc(`${prefix}-vpc`, {
      cidrBlock: args.vpcCidr,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      tags: { Name: `${prefix}-vpc`, Project: args.projectName, Environment: args.environment },
    }, { parent: this });
    this.internetGateway = new aws.ec2.InternetGateway(`${prefix}-igw`, {
      vpcId: this.vpc.id,
      tags: { Name: `${prefix}-igw`, Project: args.projectName, Environment: args.environment },
    }, { parent: this });
    this.publicRouteTable = new aws.ec2.RouteTable(`${prefix}-public-rt`, {
      vpcId: this.vpc.id,
      routes: [{ cidrBlock: "0.0.0.0/0", gatewayId: this.internetGateway.id }],
      tags: { Name: `${prefix}-public-rt`, Project: args.projectName, Environment: args.environment },
    }, { parent: this });

    // The host receives its single public address from the lifecycle-managed EIP,
    // not from the subnet default. ALB ENIs remain public in an IGW-routed subnet.
    this.publicSubnets = args.publicSubnetCidrs.map((cidr, index) => new aws.ec2.Subnet(`${prefix}-public-subnet-${index}`, {
      vpcId: this.vpc.id,
      cidrBlock: cidr,
      availabilityZone: availabilityZones.apply(zones => zones[index]),
      mapPublicIpOnLaunch: false,
      tags: { Name: `${prefix}-public-subnet-${index}`, Project: args.projectName, Environment: args.environment, Type: "public" },
    }, { parent: this }));
    this.publicSubnets.forEach((subnet, index) => new aws.ec2.RouteTableAssociation(`${prefix}-public-rta-${index}`, {
      subnetId: subnet.id,
      routeTableId: this.publicRouteTable.id,
    }, { parent: this }));

    this.publicNetworkAcl = new aws.ec2.NetworkAcl(`${prefix}-public-nacl`, {
      vpcId: this.vpc.id,
      tags: { Name: `${prefix}-public-nacl`, Project: args.projectName, Environment: args.environment },
    }, { parent: this });
    const naclRules: Array<{ direction: "ingress" | "egress"; ruleNumber: number; protocol: string; fromPort?: number; toPort?: number; cidrBlock: string }> = [
      { direction: "ingress", ruleNumber: 100, protocol: "-1", cidrBlock: args.vpcCidr },
      { direction: "ingress", ruleNumber: 110, protocol: "tcp", fromPort: 443, toPort: 443, cidrBlock: "0.0.0.0/0" },
      { direction: "ingress", ruleNumber: 120, protocol: "tcp", fromPort: 1024, toPort: 65535, cidrBlock: "0.0.0.0/0" },
      { direction: "egress", ruleNumber: 100, protocol: "-1", cidrBlock: args.vpcCidr },
      { direction: "egress", ruleNumber: 110, protocol: "tcp", fromPort: 443, toPort: 443, cidrBlock: "0.0.0.0/0" },
      { direction: "egress", ruleNumber: 120, protocol: "tcp", fromPort: 5432, toPort: 5432, cidrBlock: "0.0.0.0/0" },
      { direction: "egress", ruleNumber: 130, protocol: "tcp", fromPort: 1024, toPort: 65535, cidrBlock: "0.0.0.0/0" },
    ];
    naclRules.forEach(rule => new aws.ec2.NetworkAclRule(`${prefix}-public-nacl-${rule.direction}-${rule.ruleNumber}`, {
      networkAclId: this.publicNetworkAcl.id,
      egress: rule.direction === "egress",
      ruleNumber: rule.ruleNumber,
      ruleAction: "allow",
      protocol: rule.protocol,
      fromPort: rule.fromPort,
      toPort: rule.toPort,
      cidrBlock: rule.cidrBlock,
    }, { parent: this }));
    this.publicSubnets.forEach((subnet, index) => new aws.ec2.NetworkAclAssociation(`${prefix}-public-nacl-association-${index}`, {
      subnetId: subnet.id,
      networkAclId: this.publicNetworkAcl.id,
    }, { parent: this }));

    this.defaultSecurityGroup = new aws.ec2.SecurityGroup(`${prefix}-default-sg`, {
      vpcId: this.vpc.id,
      description: "Default security group for platform resources",
      tags: { Name: `${prefix}-default-sg`, Project: args.projectName, Environment: args.environment },
    }, { parent: this });
    this.registerOutputs();
  }
}
