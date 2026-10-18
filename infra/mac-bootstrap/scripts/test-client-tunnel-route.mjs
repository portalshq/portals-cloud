import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawn, spawnSync} from 'node:child_process'
import net from 'node:net'
import dgram from 'node:dgram'

const listenTcp = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
const listenUdp = socket => new Promise(resolve => socket.bind(0, '127.0.0.1', () => resolve(socket.address().port)))
const closeTcp = server => new Promise(resolve => server.close(resolve))
const closeUdp = socket => new Promise(resolve => socket.close(resolve))

test('temporary TCP/UDP routing preserves bytes and removes only its hosts entry', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'portals-route-test-'))
  const hostsFile = join(dir, 'hosts')
  const original = '127.0.0.1 localhost\n::1 localhost\n'
  writeFileSync(hostsFile, original)
  const tcpEcho = net.createServer(socket => socket.pipe(socket))
  const udpEcho = dgram.createSocket('udp4')
  udpEcho.on('message', (message, sender) => udpEcho.send(message, sender.port, sender.address))
  const tcpPort = await listenTcp(tcpEcho)
  const udpPort = await listenUdp(udpEcho)
  const tcpLocal = net.createServer()
  const tcpLocalPort = await listenTcp(tcpLocal)
  await closeTcp(tcpLocal)
  const udpLocal = dgram.createSocket('udp4')
  const udpLocalPort = await listenUdp(udpLocal)
  await closeUdp(udpLocal)
  const child = spawn('/usr/bin/python3', ['-I',
    new URL('./client-tunnel-route.py', import.meta.url).pathname,
    '127.0.0.1', String(tcpPort), '127.0.0.1', String(udpPort),
    String(udpLocalPort), String(tcpLocalPort), String(process.pid),
  ], {
    env: {...process.env, PORTALS_ROUTE_TEST_MODE: '1', PORTALS_ROUTE_HOSTS_FILE: hostsFile},
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const childExited = new Promise(resolve => child.once('exit', resolve))
  let stdout = '', stderr = ''
  child.stdout.on('data', data => { stdout += data })
  child.stderr.on('data', data => { stderr += data })
  try {
    await new Promise((resolve, reject) => {
      const start = Date.now()
      const timer = setInterval(() => {
        if (stdout.includes('CLIENT_ROUTE_READY')) { clearInterval(timer); resolve() }
        else if (child.exitCode !== null || Date.now() - start > 5000) {
          clearInterval(timer); reject(new Error(`Helper did not start: ${stderr}`))
        }
      }, 10)
    })
    assert.match(readFileSync(hostsFile, 'utf8'), /127\.0\.0\.1 lore\.portals\.works auth\.portals\.works # portals-network-client-route:/)
    const tcpResponse = await new Promise((resolve, reject) => {
      const client = net.connect(tcpLocalPort, '127.0.0.1')
      client.on('connect', () => client.write('tcp-ready'))
      client.on('data', data => { client.destroy(); resolve(data.toString()) })
      client.on('error', reject)
    })
    assert.equal(tcpResponse, 'tcp-ready')
    const udpClient = dgram.createSocket('udp4')
    try {
      const udpResponse = await Promise.race([
        new Promise((resolve, reject) => {
          udpClient.once('message', data => resolve(data.toString()))
          udpClient.once('error', reject)
          udpClient.send(Buffer.from('quic-route-ready'), udpLocalPort, '127.0.0.1')
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('UDP relay timed out')), 2000)),
      ])
      assert.equal(udpResponse, 'quic-route-ready')
    } finally { udpClient.close() }
  } finally {
    child.kill('SIGTERM')
    await childExited
    assert.match(stdout, /CLIENT_ROUTE_CLEANED/)
    assert.equal(readFileSync(hostsFile, 'utf8'), original)
    await closeTcp(tcpEcho)
    await closeUdp(udpEcho)
    rmSync(dir, {recursive: true, force: true})
  }
})

test('invalid upstream and preexisting hosts mapping fail before any edit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'portals-route-reject-'))
  const hostsFile = join(dir, 'hosts')
  const original = '127.0.0.1 localhost\n'
  const invoke = tcpHost => spawnSync('/usr/bin/python3', [
    '-I', new URL('./client-tunnel-route.py', import.meta.url).pathname,
    tcpHost, '50001', '127.0.0.1', '50002', '50003', '50004', String(process.pid),
  ], {
    env: {...process.env, PORTALS_ROUTE_TEST_MODE: '1', PORTALS_ROUTE_HOSTS_FILE: hostsFile},
    encoding: 'utf8', timeout: 3000,
  })
  try {
    writeFileSync(hostsFile, original)
    assert.notEqual(invoke('attacker.example').status, 0)
    assert.equal(readFileSync(hostsFile, 'utf8'), original)
    const existing = `${original}127.0.0.1 lore.portals.works # existing\n`
    writeFileSync(hostsFile, existing)
    assert.notEqual(invoke('127.0.0.1').status, 0)
    assert.equal(readFileSync(hostsFile, 'utf8'), existing)
  } finally { rmSync(dir, {recursive: true, force: true}) }
})

test('owner process loss removes the temporary hosts entry', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'portals-route-owner-'))
  const hostsFile = join(dir, 'hosts')
  const original = '127.0.0.1 localhost\n'
  writeFileSync(hostsFile, original)
  const tcpPortProbe = net.createServer()
  const tcpLocalPort = await listenTcp(tcpPortProbe)
  await closeTcp(tcpPortProbe)
  const udpPortProbe = dgram.createSocket('udp4')
  const udpLocalPort = await listenUdp(udpPortProbe)
  await closeUdp(udpPortProbe)
  const owner = spawn('/bin/sleep', ['30'], {stdio: 'ignore'})
  const helper = spawn('/usr/bin/python3', [
    '-I', new URL('./client-tunnel-route.py', import.meta.url).pathname,
    '127.0.0.1', '50001', '127.0.0.1', '50002',
    String(udpLocalPort), String(tcpLocalPort), String(owner.pid),
  ], {
    env: {...process.env, PORTALS_ROUTE_TEST_MODE: '1', PORTALS_ROUTE_HOSTS_FILE: hostsFile},
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  helper.stdout.on('data', data => { output += data })
  const exited = new Promise(resolve => helper.once('exit', resolve))
  try {
    await new Promise((resolve, reject) => {
      const start = Date.now()
      const timer = setInterval(() => {
        if (output.includes('CLIENT_ROUTE_READY')) { clearInterval(timer); resolve() }
        else if (Date.now() - start > 5000) { clearInterval(timer); reject(new Error('Helper did not become ready')) }
      }, 10)
    })
    owner.kill('SIGTERM')
    await Promise.race([exited, new Promise((_, reject) => setTimeout(() => reject(new Error('Owner-loss cleanup timed out')), 5000))])
    assert.match(output, /CLIENT_ROUTE_CLEANED/)
    assert.equal(readFileSync(hostsFile, 'utf8'), original)
  } finally {
    owner.kill('SIGTERM')
    helper.kill('SIGTERM')
    await exited
    rmSync(dir, {recursive: true, force: true})
  }
})
