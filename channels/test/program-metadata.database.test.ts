import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import type pg from 'pg'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as listChannels } from '../app/api/admin/channels/route'
import { PATCH as editProgram } from '../app/api/admin/programs/[id]/route'
import { GET as previewChannel } from '../app/api/channels/[slug]/preview/route'
import { getChannelCatalog } from '../lib/catalog'
import { adminRequest, makePool, resetPools, stubAdminEnv, usePools } from './helpers'

beforeEach(() => { stubAdminEnv(); vi.stubEnv('CHANNELS_APPS', '') })
afterEach(() => { resetPools(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('central program descriptions', () => {
  it('flows from an admin edit through real catalog and binding queries', async () => {
    const db = new PGlite()
    try {
      await db.exec(`
        CREATE TABLE programs (id text PRIMARY KEY, name text NOT NULL);
        CREATE TABLE stations (id text PRIMARY KEY, name text NOT NULL);
        CREATE TABLE station_schedule_rules (channel_id text, program_id text, station_id text);
        CREATE TABLE station_program_slots (channel_id text, program_id text, station_id text, status text, starts_at timestamptz, ends_at timestamptz, metadata jsonb);
        INSERT INTO programs VALUES ('bears-live', 'Bears'), ('other', 'Other');
        INSERT INTO stations VALUES ('station', 'Station');
        INSERT INTO station_schedule_rules VALUES ('bears', 'bears-live', 'station'), ('bears', 'other', 'station');
      `)
      await db.exec(await readFile(new URL('../../packages/channel-registry/sql/001_program_metadata.sql', import.meta.url), 'utf8'))
      const central = { query: (request: string | { text: string; values: unknown[] }, values?: unknown[]) =>
        typeof request === 'string' ? db.query(request, values) : db.query(request.text, request.values),
      } as unknown as pg.Pool
      const app = makePool((sql) => ({ rows: sql.includes('FROM channels') ? [{ id: 'bears', name: 'Bears', created_at: new Date('2026-01-01') }] : [] }))
      usePools({ app, central })
      vi.stubGlobal('fetch', vi.fn(async () => Response.json({
        playback: null, program: { id: 'bears-live', description: 'Stale app copy.', tagline: 'Old tagline.' },
      })))

      const listed = await (await listChannels(adminRequest('/api/admin/channels'))).json()
      expect(listed[0].programs.map((program: { id: string }) => program.id)).toEqual(['bears-live', 'other'])
      const edited = await editProgram(adminRequest('/api/admin/programs/bears-live', {
        method: 'PATCH', body: { description: 'A shared description.', tagline: 'Shared tagline.' },
      }), { params: Promise.resolve({ id: 'bears-live' }) })
      expect(edited.status).toBe(200)
      expect((await getChannelCatalog()).find((channel) => channel.slug === 'bears')).toMatchObject({
        programId: 'bears-live', description: 'A shared description.', tagline: 'Shared tagline.', metadataDescription: '',
      })
      const preview = await previewChannel(new Request('https://channels.example/api/channels/bears/preview'), {
        params: Promise.resolve({ slug: 'bears' }),
      })
      expect(await preview.json()).toMatchObject({ program: { id: 'bears-live', description: 'A shared description.', tagline: 'Shared tagline.' } })
      expect((await db.query("SELECT description FROM programs WHERE id = 'other'")).rows[0]).toEqual({ description: null })
    } finally {
      await db.close()
    }
  })
})
