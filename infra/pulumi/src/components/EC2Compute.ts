import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { EC2ComputeArgs } from "../interfaces";

/**
 * One public ECS host. The ASG lifecycle hook reassociates the single EIP before
 * completing every launch, keeping Neon allowlisting stable through replacement.
 */
export class EC2Compute extends pulumi.ComponentResource {
  public readonly autoScalingGroup: aws.autoscaling.Group;
  public readonly capacityProvider: aws.ecs.CapacityProvider;
  public readonly instanceRole: aws.iam.Role;
  public readonly instanceSecurityGroup: aws.ec2.SecurityGroup;
  public readonly elasticIp: aws.ec2.Eip;

  constructor(name: string, args: EC2ComputeArgs, opts?: pulumi.ComponentResourceOptions) {
    super("portals:compute:EC2Compute", name, {}, opts);
    if (args.instanceCount !== 1 || args.instanceType !== "t3.micro") {
      throw new pulumi.ResourceError("The public-host profile requires exactly one t3.micro ECS instance.", this);
    }
    const prefix = `${args.projectName}-${args.environment}`;

    this.instanceRole = new aws.iam.Role(`${prefix}-ecs-instance-role`, {
      assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: "ec2.amazonaws.com" }),
      managedPolicyArns: [
        "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role",
        "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
        "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy",
      ],
      tags: { Project: args.projectName, Environment: args.environment, Service: "ecs-container-instance" },
    }, { parent: this });
    // This policy is intentionally attached to the human deployment identity,
    // not the instance role or an EC2 API termination-protection flag. The ASG
    // service role therefore remains able to replace an unhealthy host.
    new aws.iam.UserPolicy(`${prefix}-deny-manual-ecs-host-termination`, {
      user: args.manualTerminationDenyUserName,
      policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
          Sid: "DenyManualTerminationOfPortalsEcsHost",
          Effect: "Deny",
          Action: "ec2:TerminateInstances",
          Resource: "*",
          Condition: {
            StringEquals: {
              "ec2:ResourceTag/Project": args.projectName,
              "ec2:ResourceTag/Environment": args.environment,
              "ec2:ResourceTag/Role": "ecs-host",
            },
          },
        }],
      }),
    }, { parent: this });
    const instanceProfile = new aws.iam.InstanceProfile(`${prefix}-ecs-instance-profile`, {
      role: this.instanceRole.name,
      tags: { Project: args.projectName, Environment: args.environment },
    }, { parent: this });

    this.instanceSecurityGroup = new aws.ec2.SecurityGroup(`${prefix}-ecs-host-sg`, {
      vpcId: args.vpcId,
      description: "Single public ECS host; application ingress is ALB-only",
      revokeRulesOnDelete: true,
      tags: { Project: args.projectName, Environment: args.environment, Service: "ecs-host" },
    }, { parent: this });
    new aws.ec2.SecurityGroupRule(`${prefix}-ecs-host-https-egress`, {
      type: "egress", protocol: "tcp", fromPort: 443, toPort: 443,
      securityGroupId: this.instanceSecurityGroup.id, cidrBlocks: ["0.0.0.0/0"],
      description: "ECR, SSM, CloudWatch, Cognito, and HTTPS APIs",
    }, { parent: this });
    new aws.ec2.SecurityGroupRule(`${prefix}-ecs-host-neon-egress`, {
      type: "egress", protocol: "tcp", fromPort: 5432, toPort: 5432,
      securityGroupId: this.instanceSecurityGroup.id, cidrBlocks: ["0.0.0.0/0"],
      description: "Neon PostgreSQL; Neon must allowlist the lifecycle-managed EIP",
    }, { parent: this });
    for (const protocol of ["tcp", "udp"] as const) {
      new aws.ec2.SecurityGroupRule(`${prefix}-ecs-host-dns-${protocol}`, {
        type: "egress", protocol, fromPort: 53, toPort: 53,
        securityGroupId: this.instanceSecurityGroup.id, cidrBlocks: [args.vpcCidr],
        description: "VPC DNS",
      }, { parent: this });
    }

    this.elasticIp = new aws.ec2.Eip(`${prefix}-ecs-host-eip`, {
      domain: "vpc",
      tags: { Name: `${prefix}-ecs-host-eip`, Project: args.projectName, Environment: args.environment, Purpose: "neon-allowlist" },
    }, { parent: this, protect: args.recoveryControlsEnabled });

    const ecsOptimizedAmi = args.amiId
      ? pulumi.output(args.amiId)
      : aws.ssm.getParameterOutput({
          name: args.amiSsmParameter ?? "/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/image_id",
        }).apply(parameter => parameter.value);
    const userDataScript = `#!/bin/bash
set -euo pipefail
cat >/etc/ecs/ecs.config <<'EOF'
ECS_CLUSTER=${args.clusterName}
ECS_ENABLE_AWSLOGS_EXECUTIONROLE_OVERRIDE=true
ECS_ENABLE_CONTAINER_METADATA=true
ECS_RESERVED_MEMORY=128
ECS_ENABLE_TASK_IAM_ROLE=true
ECS_ENABLE_TASK_IAM_ROLE_NETWORK_HOST=true
EOF

cat >/usr/local/sbin/portals-ecs-host-iam.sh <<'EOF'
#!/bin/bash
set -euo pipefail
sysctl -w net.ipv4.conf.all.route_localnet=1
iptables -t nat -C PREROUTING -p tcp -d 169.254.170.2 --dport 80 -j DNAT --to-destination 127.0.0.1:51679 2>/dev/null || iptables -t nat -A PREROUTING -p tcp -d 169.254.170.2 --dport 80 -j DNAT --to-destination 127.0.0.1:51679
iptables -t nat -C OUTPUT -d 169.254.170.2 -p tcp -m tcp --dport 80 -j REDIRECT --to-ports 51679 2>/dev/null || iptables -t nat -A OUTPUT -d 169.254.170.2 -p tcp -m tcp --dport 80 -j REDIRECT --to-ports 51679
EOF
chmod 0755 /usr/local/sbin/portals-ecs-host-iam.sh
cat >/etc/systemd/system/portals-ecs-host-iam.service <<'EOF'
[Unit]
Description=Configure ECS task IAM credentials for host networking
Before=ecs.service
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/portals-ecs-host-iam.sh
RemainAfterExit=yes
[Install]
WantedBy=ecs.service
EOF
systemctl enable --now portals-ecs-host-iam.service

cat >/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json <<'EOF'
{"metrics":{"namespace":"Portals/ECSHost","append_dimensions":{"AutoScalingGroupName":"\${aws:AutoScalingGroupName}"},"metrics_collected":{"mem":{"measurement":["mem_used_percent","mem_available"],"metrics_collection_interval":60},"disk":{"measurement":["used_percent"],"metrics_collection_interval":60,"resources":["/"]}}}}
EOF
cat >/usr/local/sbin/portals-cloudwatch-agent.sh <<'EOF'
#!/bin/bash
set -euo pipefail
for _ in $(seq 1 60); do
  if yum install -y amazon-cloudwatch-agent; then
    /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json -s
    exit 0
  fi
  sleep 10
done
exit 1
EOF
chmod 0755 /usr/local/sbin/portals-cloudwatch-agent.sh
cat >/etc/systemd/system/portals-cloudwatch-agent.service <<'EOF'
[Unit]
Description=Install and start CloudWatch agent after EIP networking is available
After=network-online.target cloud-final.service
Wants=network-online.target
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/portals-cloudwatch-agent.sh
RemainAfterExit=yes
[Install]
WantedBy=multi-user.target
EOF
systemctl enable --now portals-cloudwatch-agent.service
cat >/etc/systemd/system/portals-agent-verification.service <<'EOF'
[Unit]
Description=Verify the ECS-optimized AMI agents are installed and active
After=ecs.service amazon-ssm-agent.service
Wants=ecs.service amazon-ssm-agent.service
[Service]
Type=oneshot
ExecStart=/usr/bin/systemctl is-active --quiet ecs
ExecStart=/usr/bin/systemctl is-active --quiet amazon-ssm-agent
[Install]
WantedBy=multi-user.target
EOF
systemctl enable --now portals-agent-verification.service
`;
    const launchTemplate = new aws.ec2.LaunchTemplate(`${prefix}-ecs-host-template`, {
      imageId: ecsOptimizedAmi,
      instanceType: args.instanceType,
      iamInstanceProfile: { arn: instanceProfile.arn },
      networkInterfaces: [{ deviceIndex: 0, associatePublicIpAddress: "false", securityGroups: [this.instanceSecurityGroup.id] }],
      userData: Buffer.from(userDataScript, "utf8").toString("base64"),
      metadataOptions: { httpTokens: "required", httpEndpoint: "enabled" },
      blockDeviceMappings: [{
        deviceName: "/dev/xvda",
        ebs: { encrypted: "true", volumeSize: 30, volumeType: "gp3", deleteOnTermination: "true" },
      }],
      tagSpecifications: [{ resourceType: "instance", tags: { Project: args.projectName, Environment: args.environment, Role: "ecs-host" } }],
      tags: { Project: args.projectName, Environment: args.environment },
    }, { parent: this });
    const autoScalingGroupName = `${prefix}-ecs-host`;
    const lifecycleHookName = `${prefix}-eip-launch`;
    const lifecycleRole = new aws.iam.Role(`${prefix}-eip-lifecycle-role`, {
      assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: "lambda.amazonaws.com" }),
      tags: { Project: args.projectName, Environment: args.environment },
    }, { parent: this });
    const lifecyclePolicy = new aws.iam.RolePolicy(`${prefix}-eip-lifecycle-policy`, {
      role: lifecycleRole.id,
      policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          { Effect: "Allow", Action: ["ec2:AssociateAddress", "ec2:DescribeAddresses"], Resource: "*" },
          { Effect: "Allow", Action: "autoscaling:CompleteLifecycleAction", Resource: "*" },
          { Effect: "Allow", Action: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"], Resource: "*" },
        ],
      }),
    }, { parent: this });
    const lifecycleFunction = new aws.lambda.Function(`${prefix}-eip-lifecycle`, {
      role: lifecycleRole.arn,
      runtime: "nodejs20.x",
      handler: "index.handler",
      timeout: 60,
      environment: { variables: { ASG_NAME: autoScalingGroupName, ALLOCATION_ID: this.elasticIp.id, LIFECYCLE_HOOK_NAME: lifecycleHookName } },
      code: new pulumi.asset.AssetArchive({
        "index.mjs": new pulumi.asset.StringAsset(`import { EC2Client, AssociateAddressCommand, DescribeAddressesCommand } from "@aws-sdk/client-ec2";
import { AutoScalingClient, CompleteLifecycleActionCommand } from "@aws-sdk/client-auto-scaling";
const ec2 = new EC2Client({}); const autoscaling = new AutoScalingClient({});
export const handler = async (event) => { const detail = event.detail || {};
  if (detail.AutoScalingGroupName !== process.env.ASG_NAME || !detail.EC2InstanceId || !detail.LifecycleActionToken) throw new Error("Unexpected lifecycle event");
  const addresses = await ec2.send(new DescribeAddressesCommand({ AllocationIds: [process.env.ALLOCATION_ID] }));
  if (addresses.Addresses?.length !== 1 || addresses.Addresses[0].AllocationId !== process.env.ALLOCATION_ID) throw new Error("Expected Elastic IP allocation is unavailable");
  try {
    await ec2.send(new AssociateAddressCommand({ AllocationId: process.env.ALLOCATION_ID, InstanceId: detail.EC2InstanceId, AllowReassociation: true }));
    await autoscaling.send(new CompleteLifecycleActionCommand({ AutoScalingGroupName: detail.AutoScalingGroupName, LifecycleHookName: process.env.LIFECYCLE_HOOK_NAME, LifecycleActionToken: detail.LifecycleActionToken, LifecycleActionResult: "CONTINUE" }));
  } catch (error) {
    await autoscaling.send(new CompleteLifecycleActionCommand({ AutoScalingGroupName: detail.AutoScalingGroupName, LifecycleHookName: process.env.LIFECYCLE_HOOK_NAME, LifecycleActionToken: detail.LifecycleActionToken, LifecycleActionResult: "ABANDON" }));
    throw error;
  }
};`),
      }),
      tags: { Project: args.projectName, Environment: args.environment, Purpose: "ecs-eip-lifecycle" },
    }, { parent: this, dependsOn: [lifecyclePolicy] });
    const lifecycleRule = new aws.cloudwatch.EventRule(`${prefix}-eip-lifecycle-rule`, {
      eventPattern: JSON.stringify({
        source: ["aws.autoscaling"],
        "detail-type": ["EC2 Instance-launch Lifecycle Action"],
        detail: { AutoScalingGroupName: [autoScalingGroupName], LifecycleTransition: ["autoscaling:EC2_INSTANCE_LAUNCHING"] },
      }),
    }, { parent: this });
    const lifecycleTarget = new aws.cloudwatch.EventTarget(`${prefix}-eip-lifecycle-target`, {
      rule: lifecycleRule.name,
      arn: lifecycleFunction.arn,
    }, { parent: this });
    const lifecyclePermission = new aws.lambda.Permission(`${prefix}-eip-lifecycle-eventbridge`, {
      action: "lambda:InvokeFunction",
      function: lifecycleFunction.name,
      principal: "events.amazonaws.com",
      sourceArn: lifecycleRule.arn,
    }, { parent: this });

    this.autoScalingGroup = new aws.autoscaling.Group(`${prefix}-ecs-host-asg`, {
      name: autoScalingGroupName,
      minSize: 1,
      maxSize: 1,
      desiredCapacity: 1,
      protectFromScaleIn: true,
      healthCheckType: "EC2",
      healthCheckGracePeriod: 300,
      initialLifecycleHooks: [{
        name: lifecycleHookName,
        lifecycleTransition: "autoscaling:EC2_INSTANCE_LAUNCHING",
        defaultResult: "ABANDON",
        heartbeatTimeout: 300,
      }],
      vpcZoneIdentifiers: args.publicSubnetIds,
      launchTemplate: { id: launchTemplate.id, version: "$Latest" },
      tags: [
        { key: "Name", value: `${prefix}-ecs-host`, propagateAtLaunch: true },
        { key: "Project", value: args.projectName, propagateAtLaunch: true },
        { key: "Environment", value: args.environment, propagateAtLaunch: true },
        { key: "AmazonECSManaged", value: "true", propagateAtLaunch: true },
      ],
    }, { parent: this, protect: args.recoveryControlsEnabled, dependsOn: [lifecycleTarget, lifecyclePermission] });

    this.capacityProvider = new aws.ecs.CapacityProvider(`${prefix}-ec2-capacity`, {
      name: args.capacityProviderName,
      autoScalingGroupProvider: {
        autoScalingGroupArn: this.autoScalingGroup.arn,
        managedScaling: { status: "ENABLED", targetCapacity: 100, minimumScalingStepSize: 1, maximumScalingStepSize: 1 },
        managedTerminationProtection: "DISABLED",
      },
      tags: { Project: args.projectName, Environment: args.environment },
    }, { parent: this });
    new aws.ecs.ClusterCapacityProviders(`${prefix}-cluster-capacity-providers`, {
      clusterName: args.clusterName,
      capacityProviders: [this.capacityProvider.name],
      defaultCapacityProviderStrategies: [{ capacityProvider: this.capacityProvider.name, weight: 1, base: 1 }],
    }, { parent: this });

    this.registerOutputs({
      autoScalingGroupArn: this.autoScalingGroup.arn,
      capacityProviderName: this.capacityProvider.name,
      instanceSecurityGroupId: this.instanceSecurityGroup.id,
      elasticIp: this.elasticIp.publicIp,
      elasticIpAllocationId: this.elasticIp.id,
    });
  }
}
