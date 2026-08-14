import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as random from "@pulumi/random";

export interface AuthFoundationArgs {
  readonly projectName: string;
  readonly environment: string;
  readonly relyingPartyId: string;
  readonly callbackUrls: string[];
  readonly logoutUrls: string[];
  readonly domainPrefix?: string;
  readonly rotationEpoch: string;
}

/**
 * Identity and signing primitives for the Auth Gateway.
 *
 * Deliberately creates a user pool only: there is no Cognito identity pool,
 * federated AWS role, or route into the application VPC. The gateway is the
 * future runtime task role must be the sole principal granted KMS signing and
 * API-key-pepper read permissions.
 */
export class AuthFoundation extends pulumi.ComponentResource {
  public readonly userPool: aws.cognito.UserPool;
  public readonly userPoolClient: aws.cognito.UserPoolClient;
  public readonly signingKey: aws.kms.Key;
  public readonly signingAlias: aws.kms.Alias;
  public readonly apiKeyPepperSecret: aws.secretsmanager.Secret;
  public readonly internalAdminSecret: aws.secretsmanager.Secret;

  constructor(name: string, args: AuthFoundationArgs, opts?: pulumi.ComponentResourceOptions) {
    super("portals:security:AuthFoundation", name, {}, opts);
    const prefix = `${args.projectName}-${args.environment}`;

    this.userPool = new aws.cognito.UserPool(`${prefix}-users`, {
      name: `${prefix}-users`,
      deletionProtection: "ACTIVE",
      userPoolTier: "PLUS",
      adminCreateUserConfig: { allowAdminCreateUserOnly: true },
      usernameAttributes: ["email"],
      autoVerifiedAttributes: ["email"],
      usernameConfiguration: { caseSensitive: false },
      mfaConfiguration: "OPTIONAL",
      softwareTokenMfaConfiguration: { enabled: true },
      accountRecoverySetting: {
        recoveryMechanisms: [{ name: "verified_email", priority: 1 }],
      },
      signInPolicy: {
        allowedFirstAuthFactors: ["WEB_AUTHN", "PASSWORD"],
      },
      webAuthnConfiguration: {
        relyingPartyId: args.relyingPartyId,
        userVerification: "required",
      },
      passwordPolicy: {
        minimumLength: 14,
        requireLowercase: true,
        requireNumbers: true,
        requireSymbols: true,
        requireUppercase: true,
        temporaryPasswordValidityDays: 1,
      },
      userPoolAddOns: { advancedSecurityMode: "ENFORCED" },
      tags: { Project: args.projectName, Environment: args.environment },
    }, { parent: this, protect: args.environment === "prod" });

    this.userPoolClient = new aws.cognito.UserPoolClient(`${prefix}-gateway-client`, {
      name: `${prefix}-auth-gateway`,
      userPoolId: this.userPool.id,
      generateSecret: false,
      allowedOauthFlowsUserPoolClient: true,
      allowedOauthFlows: ["code"],
      allowedOauthScopes: ["openid", "email", "profile"],
      callbackUrls: args.callbackUrls,
      logoutUrls: args.logoutUrls,
      supportedIdentityProviders: ["COGNITO"],
      // Cognito may retain its own hosted-login browser session. The gateway
      // deliberately discards refresh_token and never exposes refresh auth;
      // Portals credentials still require a fresh login after eight hours.
      explicitAuthFlows: ["ALLOW_USER_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
      accessTokenValidity: 8,
      idTokenValidity: 8,
      refreshTokenValidity: 1,
      tokenValidityUnits: {
        accessToken: "hours",
        idToken: "hours",
        refreshToken: "days",
      },
      enableTokenRevocation: true,
      preventUserExistenceErrors: "ENABLED",
    }, { parent: this });

    if (args.domainPrefix) {
      new aws.cognito.UserPoolDomain(`${prefix}-auth-domain`, {
        domain: args.domainPrefix,
        userPoolId: this.userPool.id,
      }, { parent: this });
    }

    this.signingKey = new aws.kms.Key(`${prefix}-jwt-signing`, {
      description: "Asymmetric RS256 signing key for short-lived Lore authorization tokens",
      keyUsage: "SIGN_VERIFY",
      customerMasterKeySpec: "RSA_2048",
      enableKeyRotation: false,
      deletionWindowInDays: 30,
      multiRegion: false,
      tags: { Project: args.projectName, Environment: args.environment, Purpose: "lore-jwt" },
    }, { parent: this, protect: args.environment === "prod" });

    this.signingAlias = new aws.kms.Alias(`${prefix}-jwt-signing`, {
      name: `alias/${prefix}-lore-jwt-signing`,
      targetKeyId: this.signingKey.keyId,
    }, { parent: this });

    const apiKeyPepper = new random.RandomBytes(`${prefix}-api-key-pepper`, {
      length: 32,
      keepers: { rotationEpoch: args.rotationEpoch },
    }, { parent: this });
    this.apiKeyPepperSecret = new aws.secretsmanager.Secret(`${prefix}-api-key-pepper`, {
      description: "Versioned HMAC pepper for service-account API keys",
      recoveryWindowInDays: 30,
      tags: { Project: args.projectName, Environment: args.environment, Purpose: "api-key-pepper" },
    }, { parent: this, protect: args.environment === "prod" });
    new aws.secretsmanager.SecretVersion(`${prefix}-api-key-pepper`, {
      secretId: this.apiKeyPepperSecret.id,
      secretString: apiKeyPepper.base64,
    }, { parent: this });

    const internalAdminToken = new random.RandomPassword(`${prefix}-internal-admin-token`, {
      length: 64,
      special: false,
      keepers: { rotationEpoch: args.rotationEpoch },
    }, { parent: this });
    this.internalAdminSecret = new aws.secretsmanager.Secret(`${prefix}-internal-admin-token`, {
      description: "Defense-in-depth bearer token for private Auth Gateway mutation endpoints",
      recoveryWindowInDays: 30,
      tags: { Project: args.projectName, Environment: args.environment, Purpose: "auth-gateway-internal" },
    }, { parent: this, protect: args.environment === "prod" });
    new aws.secretsmanager.SecretVersion(`${prefix}-internal-admin-token`, {
      secretId: this.internalAdminSecret.id,
      secretString: internalAdminToken.result,
    }, { parent: this });

    this.registerOutputs({
      userPoolId: this.userPool.id,
      clientId: this.userPoolClient.id,
      signingKeyArn: this.signingKey.arn,
      apiKeyPepperSecretArn: this.apiKeyPepperSecret.arn,
      internalAdminSecretArn: this.internalAdminSecret.arn,
    });
  }
}
