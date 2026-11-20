import { createHash, timingSafeEqual } from 'node:crypto'
import { centralDb } from './admin/db'
import { actor, audienceError, audienceJson, audienceRoute, bodyObject, transaction, uuidPattern } from './audience'

type Sender = { id: string; name: string }
export type ChatScope =
  | { kind: 'program'; programId: string }
  | { kind: 'group'; groupId: string; userId?: string }

const projection = 'position::text AS id, display_name AS name, text, sent_at AS "sentAt"'
const maxCursor = 9_223_372_036_854_775_807n
const publicReadCache = new Map<string, { until: number; result: Promise<Record<string, unknown>[]> }>()

function cursor(value: string | null): string | undefined {
  if (value === null) return undefined
  if (!/^(?:0|[1-9]\d{0,18})$/.test(value) || BigInt(value) > maxCursor) audienceError(400, 'Invalid message cursor.')
  return value
}

function validator(scope: ChatScope, after: string | undefined, rows: Record<string, unknown>[]) {
  const last = rows.at(-1)?.id
  const position = typeof last === 'string' ? last : after ?? '0'
  const thread = scope.kind === 'group' ? `group-${scope.groupId}` : `program-${scope.programId}`
  const threadHash = createHash('sha256').update(thread).digest('base64url').slice(0, 16)
  return `"chat-${threadHash}-${position}-${rows.length}"`
}

function publicRows(programId: string, after: string | undefined, limit: number) {
  const key = `${programId}:${after ?? 'tail'}:${limit}`
  const cached = publicReadCache.get(key)
  if (cached && cached.until > Date.now()) return cached.result
  const result = centralDb().query(`
    SELECT ${projection} FROM audience_chat
    WHERE group_id IS NULL AND program_id = $1
      AND ($2::bigint IS NULL OR position > $2)
    ORDER BY position ${after === undefined ? 'DESC' : 'ASC'} LIMIT $3
  `, [programId, after ?? null, limit]).then(({ rows }) => after === undefined ? rows.reverse() : rows)
  if (publicReadCache.size >= 500) {
    const now = Date.now()
    for (const [cachedKey, value] of publicReadCache) if (value.until <= now) publicReadCache.delete(cachedKey)
    while (publicReadCache.size >= 500) publicReadCache.delete(publicReadCache.keys().next().value!)
  }
  publicReadCache.set(key, { until: Date.now() + 2_000, result })
  void result.catch(() => {
    if (publicReadCache.get(key)?.result === result) publicReadCache.delete(key)
  })
  return result
}

function invalidatePublicThread(programId: string) {
  for (const key of publicReadCache.keys()) if (key.startsWith(`${programId}:`)) publicReadCache.delete(key)
}

async function sender(request: Request, body: Record<string, unknown>, scope: ChatScope): Promise<Sender> {
  const secret = process.env.CHANNELS_CHAT_SERVICE_TOKEN
  const service = request.headers.get('x-channels-chat-service')
  if (service !== null) {
    if (scope.kind !== 'program' || !secret || Buffer.byteLength(secret) !== Buffer.byteLength(service)
      || !timingSafeEqual(Buffer.from(secret), Buffer.from(service))) audienceError(403, 'Forbidden')
    const name = typeof body.name === 'string' ? body.name.trim() : undefined
    if (typeof body.authorId !== 'string' || !body.authorId.trim() || body.authorId.length > 256 || !name || name.length > 64) {
      audienceError(400, 'Invalid sender.')
    }
    return { id: body.authorId, name }
  }
  const viewer = await actor(request)
  if (!viewer) audienceError(401, 'Sign in to continue.')
  return { id: `user:${viewer.userId}`, name: viewer.displayName?.trim().slice(0, 64) || 'Viewer' }
}

export async function readChat(request: Request, scope: ChatScope) {
  return audienceRoute(async () => {
    if (scope.kind === 'program' && (!scope.programId.trim() || scope.programId.length > 256)) {
      audienceError(400, 'Invalid program.')
    }
    const url = new URL(request.url)
    const limit = Number(url.searchParams.get('limit') ?? 40)
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) audienceError(400, 'Invalid message limit.')
    const after = cursor(url.searchParams.get('after'))
    const rows = scope.kind === 'group'
      ? (await centralDb().query(`
          SELECT messages.id, messages.name, messages.text, messages."sentAt", messages.position
          FROM viewer_group_members m
          JOIN users u ON u.id = m.user_id AND u.status = 'active'
          LEFT JOIN LATERAL (
            SELECT ${projection}, position FROM audience_chat
            WHERE group_id = m.group_id AND ($3::bigint IS NULL OR position > $3)
            ORDER BY position ${after === undefined ? 'DESC' : 'ASC'} LIMIT $4
          ) messages ON true
          WHERE m.group_id = $1 AND m.user_id = $2 AND m.active
          ORDER BY messages.position ${after === undefined ? 'DESC' : 'ASC'}
        `, [scope.groupId, scope.userId ?? (await actor(request))?.userId, after ?? null, limit])).rows
      : await publicRows(scope.programId, after, limit)
    if (scope.kind === 'group' && rows.length === 0) audienceError(403, 'Group membership required.')
    const messages = rows.filter(row => row.id !== null)
    if (after === undefined && scope.kind === 'group') messages.reverse()
    const etag = validator(scope, after, messages)
    const responseHeaders = {
      ETag: etag,
      'X-Chat-Cursor': String(messages.at(-1)?.id ?? after ?? '0'),
      'Cache-Control': scope.kind === 'group'
        ? 'private, no-store'
        : 'public, s-maxage=2, stale-while-revalidate=10',
    }
    if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: responseHeaders })
    if (scope.kind === 'group') return Response.json({ messages }, { headers: responseHeaders })
    return Response.json({ messages }, { headers: responseHeaders })
  })
}

export async function writeChat(request: Request, scope: ChatScope) {
  return audienceRoute(async () => {
    const body = await bodyObject(request)
    const author = await sender(request, body, scope)
    const text = typeof body.text === 'string' ? body.text.trim() : undefined
    if (!text || text.length > 500 || typeof body.clientId !== 'string' || !uuidPattern.test(body.clientId)) {
      audienceError(400, 'Use a message between 1 and 500 characters.')
    }
    const blocked = process.env.CHANNELS_CHAT_BLOCKED_TERMS?.split(',').map(term => term.trim().toLowerCase()).filter(Boolean)
    if (blocked?.some(term => text.toLowerCase().includes(term))) audienceError(422, 'Message contains a blocked term.')
    const message = await transaction(async db => {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended('audience-author:' || $1, 0))", [author.id])
      if (scope.kind === 'group') {
        const member = await db.query(`SELECT 1 FROM viewer_group_members m JOIN users u ON u.id = m.user_id AND u.status = 'active'
          WHERE m.group_id = $1 AND m.user_id = $2 AND m.active FOR SHARE OF m, u`, [scope.groupId, author.id.slice(5)])
        if (!member.rowCount) audienceError(403, 'Group membership required.')
      } else {
        const program = await db.query('SELECT 1 FROM programs WHERE id = $1 FOR SHARE', [scope.programId])
        if (!program.rowCount) audienceError(404, 'Program not found.')
      }
      const duplicate = await db.query(`SELECT ${projection} FROM audience_chat
        WHERE group_id IS NOT DISTINCT FROM $1::uuid AND program_id IS NOT DISTINCT FROM $2::text
          AND author_id = $3 AND client_id = $4`,
      [scope.kind === 'group' ? scope.groupId : null, scope.kind === 'program' ? scope.programId : null, author.id, body.clientId])
      if (duplicate.rows[0]) return duplicate.rows[0]
      const recent = await db.query(`SELECT count(*)::int AS count FROM audience_chat
        WHERE author_id = $1 AND sent_at > now() - interval '10 seconds'`, [author.id])
      if (recent.rows[0].count >= 5) audienceError(429, 'Please wait before sending another message.')
      const thread = scope.kind === 'group' ? `group:${scope.groupId}` : `program:${scope.programId}`
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended('audience-thread:' || $1, 0))", [thread])
      const { rows } = await db.query(`INSERT INTO audience_chat
        (group_id, program_id, author_id, display_name, text, client_id, position)
        VALUES ($1,$2,$3,$4,$5,$6, CASE WHEN $1::uuid IS NULL THEN nextval('audience_public_chat_position')
          ELSE nextval('audience_private_chat_position') END) RETURNING ${projection}`,
      [scope.kind === 'group' ? scope.groupId : null, scope.kind === 'program' ? scope.programId : null,
        author.id, author.name, text, body.clientId])
      return rows[0]
    })
    if (scope.kind === 'program') invalidatePublicThread(scope.programId)
    return audienceJson(message, 201)
  })
}
