import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

/**
 * Stage-1 egress hardening (release-cycle-portals-works.md §5 decision:
 * "implement controls — not risk acceptance").
 *
 * Interface endpoints keep task traffic to AWS control/data APIs inside the
 * VPC, and a private hosted zone alias routes the auth hostname to the ALB so
 * Lore's JWKS refresh never leaves the VPC. Task security-group tightening
 * (removing broad egress) is a deliberate later stage, applied only after
 * these endpoints are verified end-to-end.
 */
export interface EgressControlsArgs {
  readonly projectName: string;
  readonly environment: string;
  readonly region: string;
  readonly vpcId: pulumi.Input<string>;
  readonly vpcCidr: string;
  readonly privateSubnetIds: pulumi.Input<pulumi.Input<string>[]>;
  readonly authHostname: string;
  /** Resolved hosted-zone id for the portals.works private zone (plain string). */
  readonly privateZoneId: string;
  readonly albDnsName: pulumi.Input<string>;
  readonly albZoneId: pulumi.Input<string>;
}

const INTERFACE_SERVICES = [
  "secretsmanager",
  "kms",
  "ecr.api",
  "ecr.dkr",
  "logs",
  "sts",
] as const;

export class EgressControls extends pulumi.ComponentResource {
  public readonly endpointSecurityGroup: aws.ec2.SecurityGroup;
  public readonly privateZone: aws.route53.Zone;

  constructor(name: string, args: EgressControlsArgs, opts?: pulumi.ComponentResourceOptions) {
    super("portals:platform:EgressControls", name, {}, opts);
    const prefix = `${args.projectName}-${args.environment}`;

    this.endpointSecurityGroup = new aws.ec2.SecurityGroup(`${prefix}-endpoints-sg`, {
      vpcId: args.vpcId,
      description: "Ingress for platform VPC interface endpoints; HTTPS from inside the VPC only",
      revokeRulesOnDelete: true,
      ingress: [{
        description: "HTTPS from within the platform VPC",
        protocol: "tcp",
        fromPort: 443,
        toPort: 443,
        cidrBlocks: [args.vpcCidr],
      }],
      tags: {
        Name: `${prefix}-endpoints-sg`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    for (const service of INTERFACE_SERVICES) {
      new aws.ec2.VpcEndpoint(
        `${prefix}-${service.replace(".", "-")}-endpoint`,
        {
          vpcId: args.vpcId,
          serviceName: `com.amazonaws.${args.region}.${service}`,
          vpcEndpointType: "Interface",
          subnetIds: args.privateSubnetIds,
          securityGroupIds: [this.endpointSecurityGroup.id],
          privateDnsEnabled: true,
          tags: {
            Name: `${prefix}-${service}`,
            Project: args.projectName,
            Environment: args.environment,
          },
        },
        { parent: this },
      );
    }

    // Private zone alias keeps Lore -> auth hostname traffic entirely in-VPC.
    this.privateZone = new aws.route53.Zone(`${prefix}-private-zone`, {
      name: "portals.works",
      vpcs: [{ vpcId: args.vpcId }],
      tags: {
        Name: `${prefix}-private-zone`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    new aws.route53.Record(`${prefix}-auth-private-alias`, {
      zoneId: args.privateZoneId,
      name: args.authHostname,
      type: "A",
      aliases: [{
        name: args.albDnsName,
        zoneId: args.albZoneId,
        evaluateTargetHealth: true,
      }],
    }, { parent: this });

    this.registerOutputs();
  }
}
