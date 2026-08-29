import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { EmailServiceArgs } from "../interfaces";

/** SES domain identity and a TLS-only configuration set for backend mail. */
export class EmailService extends pulumi.ComponentResource {
  public readonly domainIdentity: aws.ses.DomainIdentity;
  public readonly invitationConfigurationSet: aws.ses.ConfigurationSet;

  constructor(name: string, args: EmailServiceArgs, opts?: pulumi.ComponentResourceOptions) {
    super("portals:email:EmailService", name, {}, opts);
    const prefix = `${args.projectName}-${args.environment}`;
    this.domainIdentity = new aws.ses.DomainIdentity(`${prefix}-ses-domain`, {
      domain: args.domain,
    }, { parent: this });
    this.invitationConfigurationSet = new aws.ses.ConfigurationSet(`${prefix}-ses-invitations`, {
      name: `${prefix}-invitations`,
      deliveryOptions: { tlsPolicy: "Require" },
      reputationMetricsEnabled: true,
    }, { parent: this });
    this.registerOutputs({
      domainIdentityArn: this.domainIdentity.arn,
      verificationToken: this.domainIdentity.verificationToken,
      invitationConfigurationSetName: this.invitationConfigurationSet.name,
    });
  }
}
