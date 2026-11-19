#!/usr/bin/env node
// Unified HTTP/1.1 + HTTP/2 bridge for Tailscale's TLS-terminated TCP Funnel.
import http from 'node:http'
import http2 from 'node:http2'
import https from 'node:https'
import net from 'node:net'
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const port = 18766
const http1Port = 18767
const http2Port = 18768
const auth = 'auth.portals.works'
const tailscale = process.env.TAILSCALE_BIN || '/usr/local/bin/tailscale'
const stateDir = join(homedir(), '.local', 'state', 'portals-auth-funnel')
const stateFile = join(stateDir, 'grpc.pid')
const self = resolve(process.argv[1])
const run = (...args) => spawnSync(tailscale, args, { encoding: 'utf8' })
function pid() {
  try {
    const n = Number(readFileSync(stateFile, 'utf8').trim())
    if (!Number.isSafeInteger(n) || n < 2) return null
    const p = spawnSync('ps', ['-p', String(n), '-o', 'command='], { encoding: 'utf8' })
    return p.status === 0 && p.stdout.includes(self) && p.stdout.includes('--server') ? n : null
  } catch { return null }
}
function config() {
  const r = run('funnel', 'status', '--json')
  if (r.status !== 0) throw new Error('Unable to inspect Tailscale Funnel status')
  return JSON.parse(r.stdout || '{}')
}
function owns(c) { return c.TCP?.['10000']?.TCPForward === `127.0.0.1:${port}` && !!c.TCP?.['10000']?.TerminateTLS }
function stop() {
  const n = pid(); if (n) process.kill(n, 'SIGTERM')
  try { unlinkSync(stateFile) } catch (e) { if (e.code !== 'ENOENT') throw e }
}
const action = process.argv[2]
if (action !== '--server') {
  if (action === 'status') {
    const r = run('funnel', 'status'); process.stdout.write(r.stdout); process.stderr.write(r.stderr)
    console.log(`Application Auth bridge: ${pid() ? 'running' : 'not running'}`); process.exit(r.status || 0)
  }
  if (!['on', 'off'].includes(action)) { console.error('Usage: node auth-grpc-funnel.mjs on|off|status'); process.exit(2) }
  const c = config()
  if (c.TCP?.['10000'] && !owns(c)) throw new Error('Port 10000 has another Tailscale mapping; refusing to change it')
  if (action === 'off') {
    if (owns(c)) { const r = run('funnel', '--tls-terminated-tcp=10000', 'off'); if (r.status !== 0) throw new Error(r.stderr) }
    stop(); console.log('Application Auth Funnel stopped'); process.exit(0)
  }
  if (!pid()) {
    mkdirSync(stateDir, { recursive: true, mode: 0o700 })
    const p = spawn(process.execPath, [self, '--server'], { detached: true, stdio: 'ignore' })
    p.unref(); writeFileSync(stateFile, `${p.pid}\n`, { mode: 0o600 })
    await new Promise(r => setTimeout(r, 500))
    if (!pid()) throw new Error('Application Auth bridge failed to start; check port 18766')
  }
  const r = run('funnel', '--bg', '--tls-terminated-tcp=10000', `tcp://127.0.0.1:${port}`)
  process.stdout.write(r.stdout); process.stderr.write(r.stderr)
  if (r.status !== 0) { stop(); process.exit(r.status || 1) }
  process.exit(0)
}
const h1 = http.createServer((request, downstream) => {
  const headers = { ...request.headers, host: auth }
  delete headers.connection
  const upstream = https.request({
    hostname: '127.0.0.1', port: 8443, servername: auth,
    method: request.method, path: request.url, headers, timeout: 10000,
  }, response => {
    downstream.writeHead(response.statusCode || 502, response.headers)
    response.pipe(downstream)
  })
  upstream.on('timeout', () => upstream.destroy(new Error('upstream timeout')))
  upstream.on('error', () => {
    if (!downstream.headersSent) downstream.writeHead(502)
    downstream.end('Auth upstream unavailable\n')
  })
  request.pipe(upstream)
})

const h2 = http2.createServer()
h2.on('stream', (downstream, headers) => {
  const upstreamSession = http2.connect('https://127.0.0.1:8443', { servername: auth })
  upstreamSession.on('error', () => { if (!downstream.destroyed) downstream.close(http2.constants.NGHTTP2_INTERNAL_ERROR) })
  const forwarded = { ...headers, ':authority': auth }
  const upstream = upstreamSession.request(forwarded)
  upstream.on('response', responseHeaders => {
    if (!downstream.destroyed) downstream.respond(responseHeaders, { waitForTrailers: true })
  })
  let trailers = {}
  upstream.on('trailers', h => { trailers = h })
  downstream.on('wantTrailers', () => { if (!downstream.destroyed) downstream.sendTrailers(trailers) })
  upstream.on('error', () => { if (!downstream.destroyed) downstream.close(http2.constants.NGHTTP2_INTERNAL_ERROR) })
  downstream.on('error', () => upstream.destroy())
  downstream.on('close', () => { upstream.destroy(); upstreamSession.close() })
  downstream.pipe(upstream); upstream.pipe(downstream)
})
h1.on('error', error => { console.error(error.message); process.exitCode = 1 })
h2.on('error', error => { console.error(error.message); process.exitCode = 1 })
h1.listen(http1Port, '127.0.0.1')
h2.listen(http2Port, '127.0.0.1')

const bridge = net.createServer(socket => {
  socket.once('data', first => {
    socket.pause()
    const isH2 = first.subarray(0, 14).toString() === 'PRI * HTTP/2.0'
    const upstream = net.connect(isH2 ? http2Port : http1Port, '127.0.0.1', () => {
      upstream.write(first)
      socket.pipe(upstream)
      upstream.pipe(socket)
      socket.resume()
    })
    upstream.on('error', () => socket.destroy())
    socket.on('error', () => upstream.destroy())
  })
})
bridge.on('error', error => { console.error(error.message); process.exitCode = 1 })
bridge.listen(port, '127.0.0.1', () => console.log(`Unified Auth bridge listening on 127.0.0.1:${port}`))
