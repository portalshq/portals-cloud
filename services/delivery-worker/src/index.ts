import {createServer, type IncomingMessage, type ServerResponse} from 'node:http'
import {randomUUID} from 'node:crypto'
import {access} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {Pool} from 'pg'
import {verifySignature} from './wake.js'
import {claimNextJob, markManualReview} from './jobs.js'

const port = Number(process.env.PORT || 8090)
const wakePath = '/internal/wake'
const workerId = process.env.WORKER_ID || `worker-${randomUUID()}`
const databaseUrl = process.env.DATABASE_URL
const wakeSecret = process.env.DELIVERY_WAKE_SECRET
const loreEndpoint = process.env.LORE_ENDPOINT
const loreMachineToken = process.env.LORE_MACHINE_TOKEN
const sweepMs = Number(process.env.WORKER_SWEEP_MS || 15 * 60 * 1000)
const pool = databaseUrl ? new Pool({connectionString: databaseUrl, max: 2, ssl: {rejectUnauthorized: true}}) : null
const workspaceRoot = process.env.WORKSPACE_ROOT || '/tmp'
const require = createRequire(import.meta.url)
const installedLoreSdkVersion = (require('@lore-vcs/sdk/package.json') as {version?: string}).version
let shuttingDown = false
let sweepRunning = false
const wakeTimes: number[] = []

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {'content-type': 'application/json', 'cache-control': 'no-store'})
  response.end(JSON.stringify(body))
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk)
    size += buffer.length
    if (size > 16 * 1024) throw new Error('request body too large')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function runSweep() {
  if (sweepRunning || shuttingDown) return
  sweepRunning = true
  try {
    // Delivery execution is intentionally gated until the Lore SDK/protocol
    // adapter is pinned and its end-to-end authorization suite passes.
    if (deliveryEnabled()) {
      if (process.env.LORE_REMOTE_ADAPTER !== 'verified-grpc' || !loreSdkPinned()) {
        throw new Error('WORKER_ENABLE_DELIVERY requires the verified Lore adapter and matching LORE_SDK_VERSION')
      }
      const job = await claimNextJob(pool!, workerId)
      if (job && !job.manifestRef) {
        await markManualReview(pool!, job.id, workerId, 'missing_manifest_ref', 'Delivery job has no durable package manifest reference')
      } else if (job) {
        throw new Error('WORKER_ENABLE_DELIVERY requires the verified Lore adapter')
      }
    }
  } finally {
    sweepRunning = false
  }
}

async function readiness(): Promise<boolean> {
  if (!pool || !databaseUrl || !wakeSecret) return false
  try {
    await pool.query('SELECT 1')
    await access(workspaceRoot)
    if (deliveryEnabled() && (!loreEndpoint || !loreMachineToken || process.env.LORE_REMOTE_ADAPTER !== 'verified-grpc' || !loreSdkPinned())) return false
    return !shuttingDown
  } catch {
    return false
  }
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/health') return json(response, 200, {ok: true, workerId})
    if (request.method === 'GET' && request.url === '/ready') {
      const ready = await readiness()
      return json(response, ready ? 200 : 503, {ok: ready, workerId})
    }
    if (request.method !== 'POST' || request.url !== wakePath || !wakeSecret) return json(response, 404, {ok: false})
    const body = await readBody(request)
    const timestamp = request.headers['x-portals-timestamp']
    const wakeId = request.headers['x-portals-wake-id']
    const signature = request.headers['x-portals-signature']
    if (typeof timestamp !== 'string' || typeof wakeId !== 'string' || typeof signature !== 'string') return json(response, 401, {ok: false})
    if (!verifySignature({secret: wakeSecret, method: 'POST', path: wakePath, timestamp, wakeId, body, signature})) return json(response, 401, {ok: false})
    const now = Date.now()
    while (wakeTimes[0] !== undefined && wakeTimes[0] <= now - 60_000) wakeTimes.shift()
    if (wakeTimes.length >= 30) return json(response, 429, {ok: false, error: 'wake rate limit exceeded'})
    let payload: {job_id?: unknown; wake_id?: unknown}
    try {
      payload = JSON.parse(body) as {job_id?: unknown; wake_id?: unknown}
    } catch {
      return json(response, 400, {ok: false, error: 'invalid wake payload'})
    }
    if (typeof payload.job_id !== 'string' || payload.job_id.length > 200 || payload.wake_id !== wakeId) {
      return json(response, 400, {ok: false, error: 'invalid wake payload'})
    }
    wakeTimes.push(now)
    if (!pool) return json(response, 503, {ok: false})
    const replay = await pool.query('INSERT INTO delivery_wake_replays (wake_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING wake_id', [wakeId])
    if (replay.rowCount !== 1) return json(response, 409, {ok: false, error: 'replayed wake'})
    void runSweep().catch((error) => console.error('worker sweep failed', error))
    return json(response, 202, {ok: true})
  } catch (error) {
    return json(response, 400, {ok: false, error: error instanceof Error ? error.message : 'bad request'})
  }
})

server.listen(port, '127.0.0.1')
const interval = setInterval(() => void runSweep().catch((error) => console.error('worker sweep failed', error)), sweepMs)
void runSweep().catch((error) => console.error('worker initial sweep failed', error))

async function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  clearInterval(interval)
  server.close()
  await pool?.end()
}
process.once('SIGTERM', () => void shutdown())
process.once('SIGINT', () => void shutdown())

function deliveryEnabled(): boolean {
  return process.env.WORKER_ENABLE_DELIVERY === 'true'
}

function loreSdkPinned(): boolean {
  const expected = process.env.LORE_SDK_VERSION
  return Boolean(expected && installedLoreSdkVersion && expected === installedLoreSdkVersion)
}
