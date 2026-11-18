import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { GET as publicChat, POST as sendPublic } from '../app/api/chat/route'
import { POST as createGroup } from '../app/api/groups/route'
import { GET as readGroup, POST as writeGroup } from '../app/api/groups/[code]/[action]/route'
import { groupTuning } from '../lib/groups'
import { usePools, resetPools } from './helpers'

vi.mock('../lib/notification-auth', () => ({
  notificationViewer: async (request: Request) => {
    const id = request.headers.get('authorization')?.match(/^Bearer (owner|friend|stranger)$/)?.[1]
    return id ? { userId: id, displayName: id } : null
  },
}))

const db = new PGlite({ extensions: { btree_gist } })
const migrations = new URL('../../../bears-live-app/migrations-central/', import.meta.url)
const migration = (name: string) => readFile(new URL(name, migrations), 'utf8')
const msg = (text: string, clientId = crypto.randomUUID()) => ({ text, clientId })
function request(path: string, user?: string, body?: unknown, service?: string) {
  return new Request(`https://channels.example${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(user ? { authorization: `Bearer ${user}` } : {}),
      ...(service ? { 'x-channels-chat-service': service } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe.skipIf(!existsSync(migrations))('central audience', () => {
beforeAll(async () => {
  await db.exec(`
    CREATE TABLE users (id text PRIMARY KEY, status text NOT NULL DEFAULT 'active', display_name text NOT NULL);
    INSERT INTO users (id, display_name) VALUES ('owner','Owner'), ('stranger','Stranger');
    CREATE TABLE stations (id text PRIMARY KEY);
    INSERT INTO stations VALUES ('cinema'), ('studio');
    CREATE TABLE programs (id text PRIMARY KEY, tenant_id text);
    INSERT INTO programs VALUES ('bears-live','creator'), ('25th-chapter','creator');
    CREATE TABLE station_program_slots (
      id text PRIMARY KEY, station_id text, program_id text,
      starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, status text NOT NULL
    );
    ALTER TABLE station_program_slots ADD CONSTRAINT station_program_slots_valid_window CHECK (ends_at > starts_at) NOT VALID;
  `)
  await db.exec(await migration('0011_program_slugs_and_station_exclusion.sql'))
  await db.exec(await migration('0012_viewer_groups_chat.sql'))
  const query = async (text: string, values?: unknown[]) => {
    const result = await db.query(text, values)
    return { ...result, rowCount: result.affectedRows || result.rows.length }
  }
  usePools({ central: { query, connect: async () => ({ query, release() {} }) } as unknown as pg.Pool })
}, 30_000)

afterAll(async () => { resetPools(); vi.unstubAllEnvs(); await db.close() })

  it('allows two public slugs under one tenant and rejects overlapping station windows', async () => {
    expect((await db.query('SELECT slug FROM programs ORDER BY slug')).rows).toEqual([{ slug: '25th-chapter' }, { slug: 'bears' }])
    await expect(db.exec("UPDATE programs SET slug = 'renamed' WHERE id = 'bears-live'")).rejects.toMatchObject({ code: '23514' })
    await db.exec(`
      INSERT INTO station_program_slots VALUES
        ('current','cinema','bears-live', now() - interval '1 hour', now() + interval '1 hour','scheduled'),
        ('next','cinema','25th-chapter', now() + interval '1 hour', now() + interval '2 hours','scheduled'),
        ('other','studio','25th-chapter', now() - interval '1 hour', now() + interval '1 hour','live')
    `)
    await expect(db.exec(`INSERT INTO station_program_slots VALUES
      ('overlap','cinema','25th-chapter', now(), now() + interval '1 minute','scheduled')
    `)).rejects.toMatchObject({ code: '23P01' })
  })

  it('keeps signed-out viewers out of membership and private chat while stage tuning follows the station', async () => {
    const destination = { stationId: 'cinema' }
    expect((await createGroup(request('/api/groups', undefined, destination))).status).toBe(401)
    const response = await createGroup(request('/api/groups', 'owner', destination))
    expect(response.status).toBe(201)
    const { code, invite } = await response.json()
    const ctx = (action: string) => ({ params: Promise.resolve({ code, action }) })
    const mutate = (action: string, user: string | undefined, body: unknown) =>
      writeGroup(request(`/api/groups/${code}/${action}`, user, body), ctx(action))
    const read = (action: string, user?: string) => readGroup(request(`/api/groups/${code}/${action}`, user), ctx(action))

    expect(await groupTuning(code)).toMatchObject({ slug: 'bears', revision: 1, slotId: 'current' })
    expect((await mutate('membership', undefined, { action: 'join', invite })).status).toBe(401)
    expect((await mutate('membership', 'stranger', { action: 'join', invite: code })).status).toBe(403)
    expect(await (await read('membership')).json()).toEqual({ owner: false, member: false })
    expect((await mutate('membership', 'friend', { action: 'join', invite })).status).toBe(200)
    expect((await mutate('chat', 'friend', msg('Private message'))).status).toBe(201)
    expect(await (await read('chat', 'owner')).json()).toMatchObject({ messages: [{ text: 'Private message' }] })
    expect((await read('chat', 'stranger')).status).toBe(403)
    expect(await (await publicChat(request('/api/chat'))).json()).toEqual({ messages: [] })

    const stale = await mutate('tuning', 'owner', { programId: '25th-chapter', revision: 0 })
    expect(stale.status).toBe(409)
    expect((await mutate('tuning', 'stranger', { programId: '25th-chapter', revision: 1 })).status).toBe(409)
    await db.exec(`UPDATE station_program_slots SET status = 'completed' WHERE id = 'current';
      UPDATE station_program_slots SET starts_at = now() - interval '1 minute' WHERE id = 'next';`)
    expect(await groupTuning(code)).toMatchObject({ slug: '25th-chapter', revision: 1, slotId: 'next' })
    expect(await (await read('chat', 'friend')).json()).toMatchObject({ messages: [{ text: 'Private message' }] })
    expect((await mutate('membership', 'friend', { action: 'leave' })).status).toBe(200)
    expect((await read('chat', 'friend')).status).toBe(403)
    expect((await mutate('membership', 'friend', { action: 'join', invite })).status).toBe(200)
    expect((await mutate('membership', 'owner', { action: 'revoke', userId: 'friend' })).status).toBe(200)
    expect((await mutate('chat', 'friend', msg('Revoked member'))).status).toBe(403)
    expect((await mutate('membership', 'friend', { action: 'join', invite })).status).toBe(403)
    const rotated = await mutate('membership', 'owner', { action: 'invite' })
    expect(rotated.status).toBe(200)
    expect((await mutate('membership', 'friend', { action: 'join', invite })).status).toBe(403)
  })

  it('delivers one global log to both app adapters and Channels without double-writing', async () => {
    vi.stubEnv('CHANNELS_CHAT_SERVICE_TOKEN', 'service-fixture')
    vi.stubEnv('CHANNELS_CHAT_BLOCKED_TERMS', 'blocked')
    const sameMessage = msg('Hello from Bears')
    const first = await sendPublic(request('/api/chat', undefined, { ...sameMessage, authorId: 'guest:bears', name: 'Bears viewer' }, 'service-fixture'))
    expect(first.status).toBe(201)
    const retry = await sendPublic(request('/api/chat', undefined, { ...sameMessage, authorId: 'guest:bears', name: 'Bears viewer' }, 'service-fixture'))
    expect(await retry.json()).toEqual(await first.json())
    expect((await sendPublic(request('/api/chat', undefined, { ...msg('Hello from the ebook'), authorId: 'guest:ebook', name: 'Ebook viewer' }, 'service-fixture'))).status).toBe(201)
    expect((await sendPublic(request('/api/chat', 'owner', msg('Hello from Channels')))).status).toBe(201)
    expect((await sendPublic(request('/api/chat', undefined, msg('bad token'), 'wrong-fixture'))).status).toBe(403)
    expect((await sendPublic(request('/api/chat', 'owner', msg('blocked text')))).status).toBe(422)
    expect((await publicChat(request('/api/chat?limit=0'))).status).toBe(400)
    const tail = await (await publicChat(request('/api/chat?limit=3'))).json()
    expect(tail.messages.map((message: { text: string }) => message.text)).toEqual([
      'Hello from Bears', 'Hello from the ebook', 'Hello from Channels',
    ])
    expect(tail.messages.map((message: { id: string }) => message.id)).toEqual(['1', '2', '3'])
  })
})
