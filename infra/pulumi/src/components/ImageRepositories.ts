import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export interface ImageRepositoriesArgs {
  readonly projectName: string;
  readonly environment: string;
}

/** Immutable, scan-on-push ECR repositories used by production services. */
export class ImageRepositories extends pulumi.ComponentResource {
  public readonly lore: aws.ecr.Repository;
  public readonly controlPlane: aws.ecr.Repository;
  public readonly authGateway: aws.ecr.Repository;

  constructor(name: string, args: ImageRepositoriesArgs, opts?: pulumi.ComponentResourceOptions) {
    super("portals:security:ImageRepositories", name, {}, opts);
    const prefix = `${args.projectName}-${args.environment}`;
    const createRepository = (repositoryName: string): aws.ecr.Repository => {
      const repository = new aws.ecr.Repository(`${prefix}-${repositoryName}`, {
        name: `${prefix}/${repositoryName}`,
        imageTagMutability: "IMMUTABLE",
        imageScanningConfiguration: { scanOnPush: true },
        encryptionConfigurations: [{ encryptionType: "AES256" }],
        forceDelete: false,
        tags: {
          Project: args.projectName,
          Environment: args.environment,
          Service: repositoryName,
        },
      }, { parent: this, protect: args.environment === "prod" });
      new aws.ecr.LifecyclePolicy(`${prefix}-${repositoryName}`, {
        repository: repository.name,
        policy: JSON.stringify({
          rules: [{
            rulePriority: 1,
            description: "Remove untagged build intermediates after 30 days",
            selection: {
              tagStatus: "untagged",
              countType: "sinceImagePushed",
              countUnit: "days",
              countNumber: 30,
            },
            action: { type: "expire" },
          }],
        }),
      }, { parent: this });
      return repository;
    };

    this.lore = createRepository("lore");
    this.controlPlane = createRepository("control-plane");
    this.authGateway = createRepository("auth-gateway");

    this.registerOutputs({
      loreRepositoryUrl: this.lore.repositoryUrl,
      controlPlaneRepositoryUrl: this.controlPlane.repositoryUrl,
      authGatewayRepositoryUrl: this.authGateway.repositoryUrl,
    });
  }
}
