import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { PlatformNetworkArgs } from "../interfaces";

/**
 * PlatformNetwork Component
 * 
 * Creates a production-grade VPC network with:
 * - 3 public subnets
 * - 3 private subnets
 * - Internet Gateway
 * - Single cost-optimized NAT Gateway
 * - Route tables and associations
 * - Security groups
 */
export class PlatformNetwork extends pulumi.ComponentResource {
  public readonly vpc: aws.ec2.Vpc;
  public readonly publicSubnets: aws.ec2.Subnet[];
  public readonly privateSubnets: aws.ec2.Subnet[];
  public readonly internetGateway: aws.ec2.InternetGateway;
  public readonly natGateway: aws.ec2.NatGateway;
  public readonly natEip: aws.eip.Eip;
  public readonly publicRouteTable: aws.ec2.RouteTable;
  public readonly privateRouteTable: aws.ec2.RouteTable;
  public readonly defaultSecurityGroup: aws.ec2.SecurityGroup;

  constructor(name: string, args: PlatformNetworkArgs, opts?: pulumi.ComponentResourceOptions) {
    super("portals:platform:Network", name, {}, opts);

    const resourcePrefix = `${args.projectName}-${args.environment}`;

    // Create VPC
    this.vpc = new aws.ec2.Vpc(`${resourcePrefix}-vpc`, {
      cidrBlock: args.vpcCidr,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      tags: {
        Name: `${resourcePrefix}-vpc`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    // Create Internet Gateway
    this.internetGateway = new aws.ec2.InternetGateway(`${resourcePrefix}-igw`, {
      vpcId: this.vpc.id,
      tags: {
        Name: `${resourcePrefix}-igw`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    // Create Elastic IP for NAT Gateway
    this.natEip = new aws.eip.Eip(`${resourcePrefix}-nat-eip`, {
      domain: "vpc",
      tags: {
        Name: `${resourcePrefix}-nat-eip`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    // Create NAT Gateway in the first public subnet for cost optimization
    this.natGateway = new aws.ec2.NatGateway(`${resourcePrefix}-nat`, {
      allocationId: this.natEip.id,
      subnetId: pulumi.output(args.publicSubnetCidrs[0]).apply(cidr => 
        this.createPublicSubnet(0, cidr, args).id
      ),
      tags: {
        Name: `${resourcePrefix}-nat`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    // Create public subnets
    this.publicSubnets = args.publicSubnetCidrs.map((cidr, index) => 
      this.createPublicSubnet(index, cidr, args)
    );

    // Create private subnets
    this.privateSubnets = args.privateSubnetCidrs.map((cidr, index) => 
      this.createPrivateSubnet(index, cidr, args)
    );

    // Create public route table
    this.publicRouteTable = new aws.ec2.RouteTable(`${resourcePrefix}-public-rt`, {
      vpcId: this.vpc.id,
      routes: [
        {
          cidrBlock: "0.0.0.0/0",
          gatewayId: this.internetGateway.id,
        },
      ],
      tags: {
        Name: `${resourcePrefix}-public-rt`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    // Create private route table
    this.privateRouteTable = new aws.ec2.RouteTable(`${resourcePrefix}-private-rt`, {
      vpcId: this.vpc.id,
      routes: [
        {
          cidrBlock: "0.0.0.0/0",
          natGatewayId: this.natGateway.id,
        },
      ],
      tags: {
        Name: `${resourcePrefix}-private-rt`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    // Associate public subnets with public route table
    this.publicSubnets.forEach((subnet, index) => {
      new aws.ec2.RouteTableAssociation(`${resourcePrefix}-public-rta-${index}`, {
        subnetId: subnet.id,
        routeTableId: this.publicRouteTable.id,
      }, { parent: this });
    });

    // Associate private subnets with private route table
    this.privateSubnets.forEach((subnet, index) => {
      new aws.ec2.RouteTableAssociation(`${resourcePrefix}-private-rta-${index}`, {
        subnetId: subnet.id,
        routeTableId: this.privateRouteTable.id,
      }, { parent: this });
    });

    // Create default security group
    this.defaultSecurityGroup = new aws.ec2.SecurityGroup(`${resourcePrefix}-default-sg`, {
      vpcId: this.vpc.id,
      description: "Default security group for platform resources",
      tags: {
        Name: `${resourcePrefix}-default-sg`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    this.registerOutputs();
  }

  private createPublicSubnet(index: number, cidr: string, args: PlatformNetworkArgs): aws.ec2.Subnet {
    const resourcePrefix = `${args.projectName}-${args.environment}`;
    return new aws.ec2.Subnet(`${resourcePrefix}-public-subnet-${index}`, {
      vpcId: this.vpc.id,
      cidrBlock: cidr,
      availabilityZone: args.availabilityZones[index],
      mapPublicIpOnLaunch: true,
      tags: {
        Name: `${resourcePrefix}-public-subnet-${index}`,
        Project: args.projectName,
        Environment: args.environment,
        Type: "public",
      },
    }, { parent: this });
  }

  private createPrivateSubnet(index: number, cidr: string, args: PlatformNetworkArgs): aws.ec2.Subnet {
    const resourcePrefix = `${args.projectName}-${args.environment}`;
    return new aws.ec2.Subnet(`${resourcePrefix}-private-subnet-${index}`, {
      vpcId: this.vpc.id,
      cidrBlock: cidr,
      availabilityZone: args.availabilityZones[index],
      mapPublicIpOnLaunch: false,
      tags: {
        Name: `${resourcePrefix}-private-subnet-${index}`,
        Project: args.projectName,
        Environment: args.environment,
        Type: "private",
      },
    }, { parent: this });
  }
}
