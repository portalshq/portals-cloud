import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();
const projectName = config.get("projectName") ?? "portals";
const environment = config.get("environment") ?? "prod";
const prefix = `${projectName}-${environment}-relay`;
const vpcCidr = config.get("vpcCidr") ?? "10.86.0.0/16";
const publicSubnetCidr = config.get("publicSubnetCidr") ?? "10.86.1.0/24";
const instanceType = config.get("instanceType") ?? "t3.micro";
const amiSsmParameter = config.get("amiSsmParameter")
  ?? "/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id";
const wireGuardServerAddress = config.get("wireGuardServerAddress") ?? "10.77.0.1/24";
const wireGuardMacAddress = config.get("wireGuardMacAddress") ?? "10.77.0.2";
const wireGuardListenPort = Number(config.get("wireGuardListenPort") ?? "51820");
const postgresAllowedCidrs = (config.get("postgresAllowedCidrs") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
const wireGuardMacPublicKey = config.require("wireGuardMacPublicKey");
const wireGuardServerPublicKey = config.require("wireGuardServerPublicKey");
const wireGuardServerPrivateKey = config.requireSecret("wireGuardServerPrivateKey");

function requireIPv4(value: string, name: string): void {
  const octets = value.split(".");
  if (octets.length !== 4 || octets.some((octet) => !/^\d+$/.test(octet) || Number(octet) > 255)) {
    throw new Error(`${name} must be an IPv4 address`);
  }
}

function requireWireGuardKey(value: string, name: string): void {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    throw new Error(`${name} must be a WireGuard base64 public/private key`);
  }
}

requireIPv4(wireGuardServerAddress.split("/")[0], "wireGuardServerAddress");
requireIPv4(wireGuardMacAddress, "wireGuardMacAddress");
if (!Number.isInteger(wireGuardListenPort) || wireGuardListenPort < 1 || wireGuardListenPort > 65535) {
  throw new Error("wireGuardListenPort must be a valid port");
}
for (const cidr of postgresAllowedCidrs) {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}\/\d{1,2}$/.test(cidr)) throw new Error(`postgresAllowedCidrs contains invalid IPv4 CIDR: ${cidr}`);
}
requireWireGuardKey(wireGuardMacPublicKey, "wireGuardMacPublicKey");
requireWireGuardKey(wireGuardServerPublicKey, "wireGuardServerPublicKey");

const az = aws.getAvailabilityZonesOutput({ state: "available" }).names.apply((names) => {
  if (names.length === 0) throw new Error("No available AWS availability zone found");
  return names[0];
});

const vpc = new aws.ec2.Vpc(`${prefix}-vpc`, {
  cidrBlock: vpcCidr,
  enableDnsHostnames: true,
  enableDnsSupport: true,
  tags: { Name: `${prefix}-vpc`, Project: projectName, Environment: environment, Purpose: "network-relay" },
});

const internetGateway = new aws.ec2.InternetGateway(`${prefix}-igw`, {
  vpcId: vpc.id,
  tags: { Name: `${prefix}-igw`, Project: projectName, Environment: environment },
});

const publicSubnet = new aws.ec2.Subnet(`${prefix}-public-subnet`, {
  vpcId: vpc.id,
  cidrBlock: publicSubnetCidr,
  availabilityZone: az,
  mapPublicIpOnLaunch: false,
  tags: { Name: `${prefix}-public-subnet`, Project: projectName, Environment: environment },
});

const routeTable = new aws.ec2.RouteTable(`${prefix}-public-routes`, {
  vpcId: vpc.id,
  routes: [{ cidrBlock: "0.0.0.0/0", gatewayId: internetGateway.id }],
  tags: { Name: `${prefix}-public-routes`, Project: projectName, Environment: environment },
});

new aws.ec2.RouteTableAssociation(`${prefix}-public-route-association`, {
  subnetId: publicSubnet.id,
  routeTableId: routeTable.id,
});

const securityGroup = new aws.ec2.SecurityGroup(`${prefix}-security-group`, {
  vpcId: vpc.id,
  description: "Public UDP/TCP relay only; no SSH or application/database access",
  ingress: [
    { protocol: "tcp", fromPort: 443, toPort: 443, cidrBlocks: ["0.0.0.0/0"], description: "Auth and Lore HTTPS/gRPC" },
    { protocol: "udp", fromPort: 443, toPort: 443, cidrBlocks: ["0.0.0.0/0"], description: "Lore QUIC" },
    { protocol: "udp", fromPort: wireGuardListenPort, toPort: wireGuardListenPort, cidrBlocks: ["0.0.0.0/0"], description: "andresb outbound WireGuard peer" },
    ...(postgresAllowedCidrs.length > 0 ? [{ protocol: "tcp", fromPort: 5432, toPort: 5432, cidrBlocks: postgresAllowedCidrs, description: "Approved PostgreSQL clients only" }] : []),
  ],
  egress: [
    { protocol: "tcp", fromPort: 80, toPort: 80, cidrBlocks: ["0.0.0.0/0"], description: "Ubuntu package bootstrap" },
    { protocol: "tcp", fromPort: 443, toPort: 443, cidrBlocks: ["0.0.0.0/0"], description: "SSM, updates, and certificate metadata" },
    { protocol: "tcp", fromPort: 53, toPort: 53, cidrBlocks: [vpcCidr], description: "VPC DNS" },
    { protocol: "udp", fromPort: 53, toPort: 53, cidrBlocks: [vpcCidr], description: "VPC DNS" },
    { protocol: "udp", fromPort: 123, toPort: 123, cidrBlocks: ["0.0.0.0/0"], description: "Time synchronization" },
    { protocol: "udp", fromPort: wireGuardListenPort, toPort: wireGuardListenPort, cidrBlocks: ["0.0.0.0/0"], description: "WireGuard transport" },
  ],
  tags: { Name: `${prefix}-security-group`, Project: projectName, Environment: environment, Purpose: "network-relay" },
});

const role = new aws.iam.Role(`${prefix}-instance-role`, {
  assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: "ec2.amazonaws.com" }),
  tags: { Project: projectName, Environment: environment, Purpose: "network-relay" },
});
new aws.iam.RolePolicyAttachment(`${prefix}-ssm`, {
  role: role.name,
  policyArn: aws.iam.ManagedPolicy.AmazonSSMManagedInstanceCore,
});
const instanceProfile = new aws.iam.InstanceProfile(`${prefix}-instance-profile`, { role: role.name });

const ami = aws.ssm.getParameterOutput({ name: amiSsmParameter }).apply((parameter) => parameter.value);
const userData = pulumi.all([wireGuardServerPrivateKey]).apply(([serverPrivateKey]) => {
  requireWireGuardKey(serverPrivateKey, "wireGuardServerPrivateKey");
  const postgresForward = postgresAllowedCidrs.length > 0 ? `
    oifname "wg0" ip daddr ${wireGuardMacAddress} tcp dport 5432 accept` : "";
  const postgresNat = postgresAllowedCidrs.length > 0 ? `
    tcp dport 5432 dnat to ${wireGuardMacAddress}:5432` : "";
  const postgresMasquerade = postgresAllowedCidrs.length > 0 ? `
    oifname "wg0" ip daddr ${wireGuardMacAddress} tcp dport 5432 masquerade` : "";
  return `#!/usr/bin/env bash
set -euo pipefail
exec > >(tee -a /var/log/portals-relay-bootstrap.log) 2>&1
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends wireguard-tools nftables unattended-upgrades
cat >/etc/sysctl.d/99-portals-relay.conf <<'EOF'
net.ipv4.ip_forward=1
net.ipv4.conf.all.src_valid_mark=1
EOF
sysctl --system
umask 077
cat >/etc/wireguard/wg0.conf <<'EOF'
[Interface]
Address = ${wireGuardServerAddress}
ListenPort = ${wireGuardListenPort}
PrivateKey = ${serverPrivateKey}

[Peer]
PublicKey = ${wireGuardMacPublicKey}
AllowedIPs = ${wireGuardMacAddress}/32
EOF
chmod 0600 /etc/wireguard/wg0.conf
cat >/etc/nftables.conf <<'EOF'
flush ruleset

table inet filter {
  chain input {
    type filter hook input priority filter; policy drop;
    ct state established,related accept
    iifname "lo" accept
    ip protocol icmp accept
    ip6 nexthdr ipv6-icmp accept
    udp dport ${wireGuardListenPort} accept
    tcp dport 443 accept
    udp dport 443 accept
  }
  chain forward {
    type filter hook forward priority filter; policy drop;
    ct state established,related accept
    oifname "wg0" ip daddr ${wireGuardMacAddress} tcp dport 8443 accept
    oifname "wg0" ip daddr ${wireGuardMacAddress} udp dport 41337 accept
${postgresForward}
  }
  chain output { type filter hook output priority filter; policy accept; }
}

table ip nat {
  chain prerouting {
    type nat hook prerouting priority dstnat; policy accept;
    tcp dport 443 dnat to ${wireGuardMacAddress}:8443
    udp dport 443 dnat to ${wireGuardMacAddress}:41337
${postgresNat}
  }
  chain postrouting {
    type nat hook postrouting priority srcnat; policy accept;
    oifname "wg0" ip daddr ${wireGuardMacAddress} tcp dport 8443 masquerade
    oifname "wg0" ip daddr ${wireGuardMacAddress} udp dport 41337 masquerade
${postgresMasquerade}
  }
}
EOF
systemctl enable --now wg-quick@wg0 nftables
`;
});

const instance = new aws.ec2.Instance(`${prefix}-instance`, {
  ami,
  instanceType,
  subnetId: publicSubnet.id,
  vpcSecurityGroupIds: [securityGroup.id],
  iamInstanceProfile: instanceProfile.name,
  associatePublicIpAddress: false,
  sourceDestCheck: false,
  userData,
  // shortcut: replacement interrupts this stateless relay, but user data only
  // runs on first boot; replacement prevents stale network policy.
  userDataReplaceOnChange: true,
  monitoring: false,
  metadataOptions: { httpEndpoint: "enabled", httpTokens: "required", httpPutResponseHopLimit: 1 },
  rootBlockDevice: { encrypted: true, volumeType: "gp3", volumeSize: 8, deleteOnTermination: true },
  tags: { Name: `${prefix}-instance`, Project: projectName, Environment: environment, Purpose: "network-relay" },
});

const elasticIp = new aws.ec2.Eip(`${prefix}-public-ip`, {
  domain: "vpc",
  tags: { Name: `${prefix}-public-ip`, Project: projectName, Environment: environment, Purpose: "network-relay" },
});
new aws.ec2.EipAssociation(`${prefix}-public-ip-association`, {
  allocationId: elasticIp.id,
  instanceId: instance.id,
});

export const publicIp = elasticIp.publicIp;
export const wireGuardEndpoint = pulumi.interpolate`${elasticIp.publicIp}:${wireGuardListenPort}`;
export const wireGuardServerPublicKeyOutput = wireGuardServerPublicKey;
export const wireGuardServerAddressOutput = wireGuardServerAddress;
export const wireGuardMacAddressOutput = wireGuardMacAddress;
export const dnsRecords = {
  auth: elasticIp.publicIp,
  lore: elasticIp.publicIp,
  loreQuic: elasticIp.publicIp,
};
