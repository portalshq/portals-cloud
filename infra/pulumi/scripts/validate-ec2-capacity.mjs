#!/usr/bin/env node
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import YAML from 'yaml'

const stack = process.argv[2] || 'dev'
const root = resolve(new URL('..', import.meta.url).pathname)
const defaults = YAML.parse(await readFile(resolve(root, 'Pulumi.yaml'), 'utf8'))
const stackConfig = YAML.parse(await readFile(resolve(root, `Pulumi.${stack}.yaml`), 'utf8'))
const namespace = `${defaults.name}:`
const value = (key) => stackConfig.config?.[`${namespace}${key}`] ?? defaults.config?.[key]?.default
const number = (key) => {
  const parsed = Number(value(key))
  if (!Number.isInteger(parsed)) throw new Error(`${key} must be a whole number.`)
  return parsed
}
const enabled = (key) => String(value(key)).toLowerCase() === 'true'
const failures = []
const requireValue = (key) => {
  if (!String(value(key) || '').trim()) failures.push(`${key} is required.`)
}
const requireCondition = (condition, message) => { if (!condition) failures.push(message) }

const instanceCount = number('ec2InstanceCount')
const instanceType = String(value('ec2InstanceType'))
const loreCount = number('loreServiceDesiredCount')
const authCount = number('authGatewayDesiredCount')
const controlCount = number('controlPlaneDesiredCount')
const backendCount = number('backendServiceDesiredCount')
const loreMemory = number('loreEc2Memory')
const authMemory = number('authGatewayEc2Memory')
const backendMemory = number('backendEc2Memory')
const taskBudget = number('ec2SchedulableMemoryMb')
const total = loreCount * loreMemory + authCount * authMemory + backendCount * backendMemory
const headroom = taskBudget - total
const ports = [41337, 41339, 8084, 8085, 8086, 8087, 8088]

requireCondition(String(value('ecsLaunchType')).toUpperCase() === 'EC2', 'ecsLaunchType must be EC2; Fargate task networking is prohibited.')
requireCondition(instanceCount === 1 && instanceType === 't3.micro', 'the approved public-host profile requires exactly one t3.micro instance.')
requireCondition(controlCount === 0, 'ControlPlaneService is retired and must remain at desiredCount 0.')
requireCondition([loreCount, authCount, backendCount].every(count => count >= 0 && count <= 1), 'Lore, Auth Gateway, and Backend desired counts must each be 0 or 1.')
requireCondition(loreMemory === 256 && authMemory === 128 && backendMemory === 128, 'task memory must remain Lore=256, AuthGateway=128, Backend=128 MiB.')
requireCondition(taskBudget === 875, 'ec2SchedulableMemoryMb must be 875 MiB (1 GiB less 125 MiB host overhead).')
requireCondition(total <= 512, `task reservations are ${total} MiB; the approved limit is 512 MiB.`)
requireCondition(headroom >= 363, `only ${headroom} MiB remains; at least 363 MiB is required.`)
requireCondition(new Set(ports).size === ports.length && ports.every(port => port > 1023), 'static host-port allocation is invalid.')
requireCondition(enabled('memoryMonitoringEnabled'), 'memoryMonitoringEnabled must be true for 80% and OOM alerts.')
requireValue('alarmNotificationEndpoint')
requireCondition(!enabled('egressEndpointsEnabled'), 'EgressControls must remain disabled in the public-host architecture.')
requireCondition(String(value('loreCpuArchitecture')).toUpperCase() === 'X86_64', 'Lore image must be X86_64 for t3.micro.')
requireCondition(String(value('authGatewayCpuArchitecture')).toUpperCase() === 'X86_64', 'Auth Gateway image must be X86_64 for t3.micro.')
if (backendCount > 0) {
  requireValue('leadsDatabaseUrlSecretArn')
  requireCondition(enabled('neonAllowlistConfirmed'), 'neonAllowlistConfirmed must be true after the EIP is added in Neon.')
}

if (failures.length) {
  console.error(`Public-host preflight failed for ${stack}:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log(JSON.stringify({
  stack,
  instance: `${instanceCount} × ${instanceType}`,
  networkMode: 'host',
  staticPorts: ports,
  reservationsMb: {lore: loreCount * loreMemory, authGateway: authCount * authMemory, backend: backendCount * backendMemory},
  totalMb: total,
  schedulableMb: taskBudget,
  headroomMb: headroom,
  memoryAlarmPercent: 80,
  requiredRuntimeChecks: ['EIP associated with the current ASG instance', 'Neon EIP allowlist and TLS connection', 'confirmed SNS subscription', 'all non-443 public probes denied'],
}, null, 2))
