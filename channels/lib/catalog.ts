import { cache } from 'react'
import { channels as mocks, type Channel } from '../components/channels/data'
import { centralDb } from './admin/db'
import { adminEnv } from './admin/env'
import { CHANNEL_SLUG, getChannelApps, getChannelPreview } from './channel-apps'

type CatalogRow = {
  slug: string
  tenant_id?: string
  creator_name: string | null
  program_id: string
  program_name: string
  program_description: string | null
  program_tagline: string | null
  station_name: string | null
  scheduled_live: boolean
  next_start: Date | null
}

let centralCache: { until: number; result: Promise<CatalogRow[]> } | undefined
let lastProgramRows = new Map<string, CatalogRow>()

function readCentral(slug?: string): Promise<CatalogRow[]> {
  if (!adminEnv().centralDatabaseUrl) return Promise.resolve([])
  if (!slug && centralCache && centralCache.until > Date.now()) return centralCache.result
  const result = (async () => {
    try {
      const { rows } = await centralDb().query<CatalogRow>(`
        WITH bindings AS (
          SELECT channel_id, program_id, station_id FROM station_schedule_rules
          UNION
          SELECT channel_id, program_id, station_id FROM station_program_slots
          WHERE status IN ('scheduled', 'live', 'completed')
        ), slot_state AS (
          SELECT channel_id, program_id, station_id,
                 bool_or(starts_at <= now()) AS scheduled_live,
                 min(starts_at) FILTER (WHERE starts_at > now()) AS next_start
          FROM station_program_slots
          WHERE status IN ('scheduled', 'live') AND ends_at > now()
          GROUP BY channel_id, program_id, station_id
        )
        SELECT DISTINCT ON (coalesce(to_jsonb(p)->>'slug', b.channel_id))
          coalesce(to_jsonb(p)->>'slug', b.channel_id) AS slug, p.id AS program_id,
          to_jsonb(p)->>'tenant_id' AS tenant_id, t.name AS creator_name, p.name AS program_name,
          p.description AS program_description, p.tagline AS program_tagline, s.name AS station_name,
          coalesce(ss.scheduled_live, false) AS scheduled_live, ss.next_start
        FROM programs p
        LEFT JOIN tenants t ON t.id = p.tenant_id
        LEFT JOIN bindings b ON p.id = b.program_id
        LEFT JOIN stations s ON s.id = b.station_id
        LEFT JOIN slot_state ss ON ss.channel_id = b.channel_id AND ss.program_id = b.program_id
          AND ss.station_id IS NOT DISTINCT FROM b.station_id
        WHERE coalesce(to_jsonb(p)->>'slug', b.channel_id) IS NOT NULL
          AND ($2::text IS NULL OR coalesce(to_jsonb(p)->>'slug', b.channel_id) = $2)
          AND ($1::text IS NULL OR b.station_id = $1)
        ORDER BY coalesce(to_jsonb(p)->>'slug', b.channel_id),
                 (to_jsonb(p)->>'slug' IS NOT NULL) DESC, scheduled_live DESC, ss.next_start NULLS LAST,
                 b.program_id, b.station_id NULLS LAST
      `, [slug ? null : process.env.CHANNELS_CATALOG_STATION_ID?.trim() || null, slug ?? null])
      for (const row of rows) lastProgramRows.set(row.slug, row)
      return rows
    } catch (error) {
      console.error('[channels] Central catalog unavailable', error)
      return []
    }
  })()
  if (!slug) centralCache = { until: Date.now() + 15_000, result }
  return result
}

async function catalog(slug?: string): Promise<Channel[]> {
  const registry = await getChannelApps()
  const apps = slug ? [...registry.values()].filter(app => app.slug === slug) : [...registry.values()]
  const [rows, previews] = await Promise.all([
    readCentral(slug),
    Promise.all(apps.map(getChannelPreview)),
  ])
  const merged = new Map(mocks.map((channel) => [channel.slug, channel]))
  const centralRows = new Map(rows.map((row) => [row.slug, row]))
  for (const row of rows) {
    if (!CHANNEL_SLUG.test(row.slug)) continue
    const mock = merged.get(row.slug)
    merged.set(row.slug, {
      slug: row.slug,
      programId: row.program_id,
      creatorId: row.tenant_id ?? undefined,
      title: row.program_name,
      heading: mock?.heading,
      by: row.creator_name ?? mock?.by ?? row.program_name,
      description: row.program_description ?? '',
      tagline: row.program_tagline ?? undefined,
      metadataDescription: '',
      category: mock?.category ?? 'Live worlds',
      live: row.scheduled_live,
      viewers: '',
      source: row.next_start ? 'Scheduled' : 'Channel',
      nextSession: row.next_start?.toISOString(),
    })
  }
  const appChannels = apps.map((app, index): Channel => {
    const existing = merged.get(app.slug)
    const playback = previews[index]
    const central = centralRows.get(app.slug)
    const last = !central ? lastProgramRows.get(app.slug) : undefined
    const previous = last && (!playback?.program || playback.program.id === last.program_id) ? last : undefined
    const appProgram = playback?.program && (!central || playback.program.id === central.program_id) ? playback.program : undefined
    const assets = `/channel-apps/${app.slug}`
    merged.delete(app.slug)
    return {
      slug: app.slug,
      programId: app.programId ?? existing?.programId ?? appProgram?.id ?? previous?.program_id,
      creatorId: existing?.creatorId ?? previous?.tenant_id ?? undefined,
      title: existing?.title ?? app.name,
      heading: app.heading ?? existing?.heading,
      headingFontFallbackUrl: app.headingFontFallbackUrl,
      headingFontUrl: app.headingFont ? `${assets}/public/${app.headingFont}` : undefined,
      by: central?.creator_name ?? app.by ?? existing?.by ?? app.name,
      description: central?.program_description ?? appProgram?.description ?? previous?.program_description ?? existing?.description ?? '',
      tagline: central?.program_tagline ?? appProgram?.tagline ?? previous?.program_tagline ?? existing?.tagline,
      metadataDescription: existing?.metadataDescription ?? existing?.description ?? '',
      category: existing?.category ?? 'Live worlds',
      viewers: '',
      source: 'Live video',
      nextSession: playback?.nextSession ?? existing?.nextSession ?? previous?.next_start?.toISOString(),
      live: playback?.live ?? false,
      stream: playback?.stream,
      previewVideo: playback?.previewVideo,
      app: {
        entry: `${assets}/watch.js`,
        legacyMountExport: app.legacyMountExport,
        theme: app.theme,
      },
      preview: {
        name: app.name,
        chatMessages: app.chatMessages,
        endpoint: `/api/channels/${app.slug}/preview`,
        backdropModule: app.backdrop ? `${assets}/backdrop.js` : undefined,
        poster: app.poster ? `${assets}/public/${app.poster}` : undefined,
      },
      previewStatus: playback ? (playback.live ? 'live' : 'off-air') : 'unavailable',
    }
  })
  return [...appChannels, ...merged.values()]
}

export const getChannelCatalog = cache(() => catalog())
export const getProgramRoom = cache(async (slug: string) =>
  (await catalog(slug)).find(channel => channel.slug === slug))
