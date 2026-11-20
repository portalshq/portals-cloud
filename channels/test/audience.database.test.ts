import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { GET as legacyPublicChat } from '../app/api/chat/route'
import { GET as readProgramChat, POST as sendProgramChat } from '../app/api/programs/[programId]/chat/route'
import { POST as createGroup } from '../app/api/groups/route'
import { GET as readGroup, POST as writeGroup } from '../app/api/groups/[code]/[action]/route'
import { groupDestinations, groupTuning } from '../lib/groups'
import { usePools, resetPools } from './helpers'

vi.mock('../lib/notification-auth', () => ({
  notificationViewer: async (request: Request) => {
    if (request.headers.get('authorization') === 'Bearer expired') {
      throw Object.assign(new Error('Expired'), { code: 16 })
    }
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
const programContext = (programId: string) => ({ params: Promise.resolve({ programId }) })
const publicChat = (programId: string, path = `/api/programs/${programId}/chat`) =>
  readProgramChat(request(path), programContext(programId))
const sendPublic = (programId: string, user: string | undefined, body: unknown, service?: string) =>
  sendProgramChat(request(`/api/programs/${programId}/chat`, user, body, service), programContext(programId))

describe.skipIf(!existsSync(migrations))('central audience', () => {
beforeAll(async () => {
  await db.exec(`
    CREATE TABLE users (id text PRIMARY KEY, status text NOT NULL DEFAULT 'active', display_name text NOT NULL);
    INSERT INTO users (id, display_name) VALUES ('owner','Owner'), ('stranger','Stranger');
    CREATE TABLE stations (id text PRIMARY KEY, name text NOT NULL);
    INSERT INTO stations VALUES ('cinema','Cinema'), ('studio','Studio');
    CREATE TABLE programs (id text PRIMARY KEY, tenant_id text, name text NOT NULL);
    INSERT INTO programs VALUES ('bears-live','creator','Bears Live'), ('25th-chapter','creator','25th Chapter');
    CREATE TABLE station_schedule_rules (id text PRIMARY KEY, station_id text, program_id text, channel_id text);
    CREATE TABLE station_program_slots (
      id text PRIMARY KEY, station_id text, program_id text, channel_id text NOT NULL,
      starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, status text NOT NULL
    );
    ALTER TABLE station_program_slots ADD CONSTRAINT station_program_slots_valid_window CHECK (ends_at > starts_at) NOT VALID;
  `)
  await db.exec(await migration('0011_program_slugs_and_station_exclusion.sql'))
  await db.exec(await migration('0012_viewer_groups_chat.sql'))
  await db.exec(await migration('0013_program_chat_and_creator_channels.sql'))
  const query = async (text: string, values?: unknown[]) => {
    const result = await db.query(text, values)
    return { ...result, rowCount: result.affectedRows || result.rows.length }
  }
  usePools({ central: { query, connect: async () => ({ query, release() {} }) } as unknown as pg.Pool })
}, 30_000)

afterAll(async () => { resetPools(); vi.unstubAllEnvs(); await db.close() })

  it('allows two program slugs under one creator channel and rejects invalid station topology', async () => {
    expect((await db.query('SELECT slug FROM programs ORDER BY slug')).rows).toEqual([{ slug: '25th-chapter' }, { slug: 'bears' }])
    await expect(db.exec("UPDATE programs SET slug = 'renamed' WHERE id = 'bears-live'")).rejects.toMatchObject({ code: '23514' })
    await db.exec(`
      INSERT INTO station_program_slots VALUES
        ('current','cinema','bears-live','creator', now() - interval '1 hour', now() + interval '1 hour','scheduled'),
        ('next','cinema','25th-chapter','creator', now() + interval '1 hour', now() + interval '2 hours','scheduled'),
        ('other','studio','25th-chapter','creator', now() - interval '1 hour', now() + interval '1 hour','live')
    `)
    await expect(db.exec(`INSERT INTO station_program_slots VALUES
      ('overlap','cinema','25th-chapter','creator', now(), now() + interval '1 minute','scheduled')
    `)).rejects.toMatchObject({ code: '23P01' })
    await expect(db.exec(`INSERT INTO station_program_slots VALUES
      ('wrong-owner','cinema','25th-chapter','another-creator', now() + interval '3 hours', now() + interval '4 hours','scheduled')
    `)).rejects.toMatchObject({ code: '23503' })
    await expect(groupDestinations()).resolves.toEqual({
      stations: [{ id: 'cinema', name: 'Cinema' }, { id: 'studio', name: 'Studio' }],
      programs: [
        { id: '25th-chapter', name: '25th Chapter', slug: '25th-chapter' },
        { id: 'bears-live', name: 'Bears Live', slug: 'bears' },
      ],
    })
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

    expect(await groupTuning(code)).toMatchObject({
      name: 'owner’s group', memberCount: 1, stationId: 'cinema', programId: 'bears-live',
      slug: 'bears', revision: 1, slotId: 'current',
    })
    expect((await mutate('membership', undefined, { action: 'join', invite })).status).toBe(401)
    expect((await mutate('membership', 'stranger', { action: 'join', invite: code })).status).toBe(403)
    expect(await (await read('membership')).json()).toEqual({ owner: false, member: false })
    expect((await mutate('membership', 'friend', { action: 'join', invite })).status).toBe(200)
    expect(await groupTuning(code)).toMatchObject({ memberCount: 2 })
    expect((await mutate('chat', 'friend', msg('Private message'))).status).toBe(201)
    expect(await (await read('chat', 'owner')).json()).toMatchObject({ messages: [{ text: 'Private message' }] })
    expect((await read('chat', 'stranger')).status).toBe(403)
    expect(await (await publicChat('bears-live')).json()).toEqual({ messages: [] })

    const stale = await mutate('tuning', 'owner', { programId: '25th-chapter', revision: 0 })
    expect(stale.status).toBe(409)
    expect((await mutate('tuning', 'stranger', { programId: '25th-chapter', revision: 1 })).status).toBe(409)
    await db.exec("UPDATE station_program_slots SET status = 'completed' WHERE id = 'current'")
    expect(await groupTuning(code)).toMatchObject({ slug: '25th-chapter', revision: 1, slotId: 'next' })
    await db.exec("UPDATE station_program_slots SET starts_at = now() - interval '1 minute' WHERE id = 'next'")
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
    expect((await mutate('membership', 'owner', { action: 'leave' })).status).toBe(409)
    expect((await mutate('membership', 'owner', { action: 'end' })).status).toBe(200)
    expect(await groupTuning(code)).toBeUndefined()
  })

  it('delivers one public log per program across app adapters and Channels without double-writing', async () => {
    vi.stubEnv('CHANNELS_CHAT_SERVICE_TOKEN', 'service-fixture')
    vi.stubEnv('CHANNELS_CHAT_BLOCKED_TERMS', 'blocked')
    const sameMessage = msg('Hello from Bears')
    const first = await sendPublic('bears-live', undefined, { ...sameMessage, authorId: 'guest:bears', name: 'Bears viewer' }, 'service-fixture')
    expect(first.status).toBe(201)
    const retry = await sendPublic('bears-live', undefined, { ...sameMessage, authorId: 'guest:bears', name: 'Bears viewer' }, 'service-fixture')
    expect(await retry.json()).toEqual(await first.json())
    expect((await sendPublic('25th-chapter', undefined, { ...msg('Hello from the ebook'), authorId: 'guest:ebook', name: 'Ebook viewer' }, 'service-fixture')).status).toBe(201)
    expect((await sendPublic('bears-live', 'owner', msg('Hello from Channels'))).status).toBe(201)
    expect((await sendPublic('bears-live', undefined, msg('bad token'), 'wrong-fixture')).status).toBe(403)
    expect((await sendPublic('bears-live', 'owner', msg('blocked text'))).status).toBe(422)
    expect((await publicChat('bears-live', '/api/programs/bears-live/chat?limit=0')).status).toBe(400)
    const tail = await (await publicChat('bears-live', '/api/programs/bears-live/chat?limit=3')).json()
    expect(tail.messages.map((message: { text: string }) => message.text)).toEqual([
      'Hello from Bears', 'Hello from Channels',
    ])
    expect(tail.messages.map((message: { id: string }) => message.id)).toEqual(['1', '3'])
    const deltaResponse = await publicChat('bears-live', '/api/programs/bears-live/chat?limit=3&after=1')
    expect(deltaResponse.headers.get('x-chat-cursor')).toBe('3')
    expect((await deltaResponse.json()).messages.map((message: { id: string }) => message.id)).toEqual(['3'])
    const unchangedRequest = request('/api/programs/bears-live/chat?limit=3&after=3')
    const unchangedContext = programContext('bears-live')
    const unchanged = await readProgramChat(unchangedRequest, unchangedContext)
    expect(await unchanged.json()).toEqual({ messages: [] })
    const conditional = await readProgramChat(new Request(unchangedRequest, {
      headers: { 'If-None-Match': unchanged.headers.get('etag')! },
    }), unchangedContext)
    expect(conditional.status).toBe(304)
    expect((await publicChat('bears-live', '/api/programs/bears-live/chat?after=-1')).status).toBe(400)
    expect((await (await publicChat('25th-chapter')).json()).messages.map((message: { text: string }) => message.text))
      .toEqual(['Hello from the ebook'])
    expect((await legacyPublicChat(request('/api/chat'))).status).toBe(400)
  })

  it('validates requests and returns public tuning without membership data', async () => {
    const create = (body: unknown, user = 'owner') => createGroup(request('/api/groups', user, body))
    expect((await create({ stationId: 'missing' })).status).toBe(404)
    expect((await create({ stationId: 'studio', programId: 'bears-live' })).status).toBe(400)
    expect((await create({ stationId: 'studio' }, 'expired')).status).toBe(401)
    expect((await create({ padding: 'x'.repeat(8192) })).status).toBe(413)
    const { code } = await (await create({ stationId: 'studio' })).json()
    const ctx = (action: string, key = code) => ({ params: Promise.resolve({ code: key, action }) })
    const read = (action: string, key = code) => readGroup(request(`/api/groups/${key}/${action}`), ctx(action, key))
    const write = (action: string, body: unknown, user = 'owner') =>
      writeGroup(request(`/api/groups/${code}/${action}`, user, body), ctx(action))
    const tuning = await read('tuning')
    expect(tuning.headers.get('cache-control')).toBe('public, s-maxage=1')
    expect(await tuning.json()).toMatchObject({ revision: 1, slug: '25th-chapter', slotId: 'other' })
    expect((await read('tuning', 'z'.repeat(32))).status).toBe(404)
    expect((await write('unknown', {})).status).toBe(404)
    expect((await write('membership', { action: 'join' })).status).toBe(400)
    expect((await write('membership', { action: 'invite' }, 'stranger')).status).toBe(403)
    expect((await write('membership', { action: 'revoke', userId: 'owner' })).status).toBe(400)
    expect((await write('membership', { action: 'revoke', userId: 'unknown' })).status).toBe(404)
    expect((await write('tuning', { programId: 'bears-live', revision: '1' })).status).toBe(400)
    expect(await (await write('tuning', { programId: 'bears-live', revision: 1 })).json()).toMatchObject({
      revision: 2, programId: 'bears-live', slug: 'bears',
    })
  })

  it('validates service identity and rate limits the durable log', async () => {
    vi.stubEnv('CHANNELS_CHAT_SERVICE_TOKEN', 'service-fixture')
    const send = (body: unknown) => sendPublic('bears-live', undefined, body, 'service-fixture')
    expect((await send({ ...msg('No sender'), name: 'Public viewer' })).status).toBe(400)
    expect((await send({ ...msg('Bad retry ID', 'invalid'), authorId: 'guest:burst', name: 'Public viewer' })).status).toBe(400)
    for (let attempt = 0; attempt < 5; attempt++) {
      expect((await send({ ...msg('Burst'), authorId: 'guest:burst', name: 'Public viewer' })).status).toBe(201)
    }
    expect((await send({ ...msg('Over limit'), authorId: 'guest:burst', name: 'Public viewer' })).status).toBe(429)
  })
})
