import { centralDb } from './admin/db'
import type { PoolClient } from 'pg'
import { notificationViewer } from './notification-auth'
import { AdminApiError, adminErrorResponse } from './admin/http'

export const uuidPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
export const codePattern = /^[A-Za-z0-9_-]{32}$/

export function audienceJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

export function audienceError(status: number, message: string): never {
  throw new AdminApiError(status, message)
}

export async function audienceRoute(run: () => Promise<Response>) {
  try { return await run() } catch (error) {
    const response = adminErrorResponse(error)
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  }
}

export async function actor(request: Request, required = true) {
  const viewer = await notificationViewer(request).catch(error => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 16) audienceError(401, 'Sign in to continue.')
    throw error
  })
  if (!viewer && required) audienceError(401, 'Sign in to continue.')
  return viewer
}

export async function bodyObject(request: Request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') audienceError(403, 'Forbidden')
  const reader = request.body?.getReader()
  if (!reader) audienceError(400, 'Invalid request.')
  const decoder = new TextDecoder()
  let raw = ''
  let bytes = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > 8192) {
        void reader.cancel().catch(() => {})
        audienceError(413, 'Request is too large.')
      }
      raw += decoder.decode(value, { stream: true })
    }
  } finally { reader.releaseLock() }
  let value: unknown
  try { value = JSON.parse(raw + decoder.decode()) } catch { audienceError(400, 'Invalid request.') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) audienceError(400, 'Invalid request.')
  return value as Record<string, unknown>
}

export async function transaction<T>(run: (db: PoolClient) => Promise<T>) {
  const db = await centralDb().connect()
  try {
    await db.query('BEGIN')
    const result = await run(db)
    await db.query('COMMIT')
    return result
  } catch (error) {
    await db.query('ROLLBACK')
    throw error
  } finally {
    db.release()
  }
}
