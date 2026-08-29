#!/usr/bin/env node
/**
 * Post-deploy public-host validation. Run from a trusted operator machine with
 * AWS CLI credentials after the static capacity preflight succeeds. It reads
 * secret material only to derive the Neon hostname and never prints it.
 */
import {execFileSync} from 'node:child_process'
import net from 'node:net'

const stack = process.argv[2] || process.env.PULUMI_STACK || 'prod'
const failures = []
const requireCondition = (condition, message) => { if (!condition) failures.push(message) }
const run = (program, args) => execFileSync(program, args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim()
const aws = (args) => JSON.parse(run('aws', [...args, '--output', 'json']))
const awsMaybe = (args) => {
  try { return aws(args) } catch { return undefined }
}
const matchingFiles = (pattern, paths) => {
  try { return run('rg', ['-l', '-i', pattern, ...paths]) } catch (error) {
    if (error && typeof error === 'object' && error.status === 1) return ''
    throw error
  }
}
const stackOutput = JSON.parse(run('pulumi', ['stack', 'output', '--stack', stack, '--json']))
const output = (name) => {
  const value = stackOutput[name]
  if (typeof value !== 'string' || !value) throw new Error(`Pulumi output ${name} is required.`)
  return value
}

function stackConfig(name) {
  const value = run('pulumi', ['config', 'get', name, '--stack', stack])
  if (!value) throw new Error(`Pulumi config ${name} is required.`)
  return value
}

function readNeonEndpoint(secretArn) {
  const raw = aws(['secretsmanager', 'get-secret-value', '--secret-id', secretArn, '--query', 'SecretString'])
  let value = raw
  try {
    const document = JSON.parse(raw)
    value = document.LEADS_DATABASE_URL ?? document.DATABASE_URL ?? document.url ?? ''
  } catch {
    // A raw PostgreSQL URL is also a valid Secrets Manager payload.
  }
  const endpoint = new URL(value)
  const host = endpoint.hostname
  const port = Number(endpoint.port || 5432)
  if (!/^[A-Za-z0-9.-]+$/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('The Neon secret does not contain a valid PostgreSQL endpoint.')
  }
  return {host, port}
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function assertPortBlocked(host, port) {
  return await new Promise(resolve => {
    const socket = net.connect({host, port})
    const timer = setTimeout(() => { socket.destroy(); resolve(true) }, 5_000)
    socket.once('connect', () => { clearTimeout(timer); socket.destroy(); resolve(false) })
    socket.once('error', () => { clearTimeout(timer); resolve(true) })
  })
}

async function main() {
  // Keep configuration and source assertions separate from live AWS checks.
  run('node', ['scripts/validate-ec2-capacity.mjs', stack])
  const forbiddenNetworking = matchingFiles('awsvpc|serviceConnect', ['src', 'index.ts'])
  requireCondition(!forbiddenNetworking, `obsolete task-networking references remain in: ${forbiddenNetworking}`)

  const allocationId = output('ecsHostElasticIpAllocationId')
  const eip = aws(['ec2', 'describe-addresses', '--allocation-ids', allocationId]).Addresses?.[0]
  requireCondition(Boolean(eip?.AssociationId && eip?.InstanceId && eip?.PublicIp), 'Elastic IP is not associated with an EC2 instance.')
  const instanceId = eip?.InstanceId
  const publicIp = eip?.PublicIp

  if (instanceId) {
    const asg = aws(['autoscaling', 'describe-auto-scaling-instances', '--instance-ids', instanceId]).AutoScalingInstances?.[0]
    requireCondition(asg?.AutoScalingGroupName === output('ecsHostAutoScalingGroupName'), 'Elastic IP instance is not the expected Auto Scaling Group member.')

    const clusterArn = output('clusterArn')
    const containerInstances = aws(['ecs', 'list-container-instances', '--cluster', clusterArn]).containerInstanceArns ?? []
    const description = containerInstances.length
      ? aws(['ecs', 'describe-container-instances', '--cluster', clusterArn, '--container-instances', ...containerInstances]).containerInstances?.[0]
      : undefined
    const registeredMemory = description?.registeredResources?.find(resource => resource.name === 'MEMORY')?.integerValue
    requireCondition(description?.ec2InstanceId === instanceId, 'The EIP instance has not registered as the ECS container instance.')
    requireCondition(Number(registeredMemory) >= 875, `ECS reports only ${registeredMemory ?? 0} MiB usable memory; at least 875 MiB is required.`)

    const neon = readNeonEndpoint(stackConfig('leadsDatabaseUrlSecretArn'))
    const send = aws([
      'ssm', 'send-command', '--instance-ids', instanceId, '--document-name', 'AWS-RunShellScript', '--timeout-seconds', '60',
      '--parameters', JSON.stringify({commands: [`timeout 15 openssl s_client -connect ${neon.host}:${neon.port} -servername ${neon.host} -verify_return_error -brief </dev/null`]}),
    ])
    const commandId = send.Command?.CommandId
    let invocation
    for (let attempt = 0; commandId && attempt < 12; attempt += 1) {
      await wait(5_000)
      invocation = awsMaybe(['ssm', 'get-command-invocation', '--command-id', commandId, '--instance-id', instanceId])
      if (['Success', 'Failed', 'TimedOut', 'Cancelled'].includes(invocation.Status)) break
    }
    requireCondition(invocation?.Status === 'Success', `Host-to-Neon TCP/TLS-path check did not succeed (${invocation?.Status ?? 'no invocation'}).`)
  }

  for (const [name, arn, expectedPath] of [
    ['Lore gRPC', output('loreGrpcTargetGroupArn'), '/grpc.health.v1.Health/Check'],
    ['Auth gRPC', output('authGrpcTargetGroupArn'), '/grpc.health.v1.Health/Check'],
    ['Auth HTTP', output('authHttpTargetGroupArn'), '/healthz'],
    ['Backend', output('backendHttpTargetGroupArn'), '/health'],
  ]) {
    const group = aws(['elbv2', 'describe-target-groups', '--target-group-arns', arn]).TargetGroups?.[0]
    requireCondition(group?.TargetType === 'instance', `${name} target group is not instance mode.`)
    requireCondition(group?.HealthCheckPath === expectedPath, `${name} health path is not ${expectedPath}.`)
    const targets = aws(['elbv2', 'describe-target-health', '--target-group-arn', arn]).TargetHealthDescriptions ?? []
    requireCondition(targets.some(target => target.TargetHealth?.State === 'healthy'), `${name} has no healthy target.`)
  }

  const topicArn = output('alarmNotificationTopicArn')
  const subscriptions = aws(['sns', 'list-subscriptions-by-topic', '--topic-arn', topicArn]).Subscriptions ?? []
  requireCondition(subscriptions.some(subscription => !['PendingConfirmation', 'Deleted'].includes(subscription.SubscriptionArn)), 'SNS alarm topic has no confirmed subscription.')

  if (publicIp) {
    const ports = [22, 41337, 41339, 8084, 8085, 8086, 8087, 8088]
    const results = await Promise.all(ports.map(async port => [port, await assertPortBlocked(publicIp, port)]))
    for (const [port, blocked] of results) requireCondition(blocked, `ECS host Elastic IP accepts direct public TCP ${port}.`)
  }

  if (failures.length) {
    console.error(`Public-host runtime validation failed for ${stack}:\n- ${failures.join('\n- ')}`)
    process.exit(1)
  }
  console.log(JSON.stringify({
    stack,
    elasticIp: publicIp,
    validation: ['EIP/ASG association', 'ECS usable memory', 'host-to-Neon path', 'instance target groups', 'SNS subscription', 'direct non-443 port denial'],
  }, null, 2))
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
