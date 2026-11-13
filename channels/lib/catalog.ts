import { cache } from 'react'
import { channels as mocks, type Channel } from '../components/channels/data'
import { centralDb } from './admin/db'
import { adminEnv } from './admin/env'
import { CHANNEL_SLUG, getChannelApps, getChannelPreview } from './channel-apps'

type CatalogRow = {
  channel_id: string
  program_name: string
  station_name: string | null
  scheduled_live: boolean
  next_start: Date | null
}

let centralCache: { until: number; result: Promise<CatalogRow[]> } | undefined

function readCentral(): Promise<CatalogRow[]> {
  if (!adminEnv().centralDatabaseUrl) return Promise.resolve([])
  if (centralCache && centralCache.until > Date.now()) return centralCache.result
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
                 bool_or(status = 'live' AND starts_at <= now()) AS scheduled_live,
                 min(starts_at) FILTER (WHERE starts_at > now()) AS next_start
          FROM station_program_slots
          WHERE status IN ('scheduled', 'live') AND ends_at > now()
          GROUP BY channel_id, program_id, station_id
        )
        SELECT DISTINCT ON (b.channel_id)
          b.channel_id, p.name AS program_name, s.name AS station_name,
          coalesce(ss.scheduled_live, false) AS scheduled_live, ss.next_start
        FROM bindings b
        JOIN programs p ON p.id = b.program_id
        LEFT JOIN stations s ON s.id = b.station_id
        LEFT JOIN slot_state ss ON ss.channel_id = b.channel_id AND ss.program_id = b.program_id
          AND ss.station_id IS NOT DISTINCT FROM b.station_id
        WHERE ($1::text IS NULL OR b.station_id = $1)
        ORDER BY b.channel_id, scheduled_live DESC, ss.next_start NULLS LAST,
                 b.program_id, b.station_id NULLS LAST
      `, [process.env.CHANNELS_CATALOG_STATION_ID?.trim() || null])
      return rows
    } catch (error) {
      console.error('[channels] Central catalog unavailable', error)
      return []
    }
  })()
  centralCache = { until: Date.now() + 15_000, result }
  return result
}

export const getChannelCatalog = cache(async (): Promise<Channel[]> => {
  const apps = [...getChannelApps().values()]
  const [rows, previews] = await Promise.all([
    readCentral(),
    Promise.all(apps.map(getChannelPreview)),
  ])
  const merged = new Map(mocks.map((channel) => [channel.slug, channel]))
  for (const row of rows) {
    if (!CHANNEL_SLUG.test(row.channel_id)) continue
    const mock = merged.get(row.channel_id)
    merged.set(row.channel_id, {
      slug: row.channel_id,
      title: row.program_name,
      heading: mock?.heading,
      by: row.station_name ?? mock?.by ?? row.program_name,
      description: '',
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
    const assets = `/channel-apps/${app.slug}`
    merged.delete(app.slug)
    return {
      slug: app.slug,
      title: existing?.title ?? app.name,
      heading: app.heading ?? existing?.heading,
      headingFontFallbackUrl: app.headingFontFallbackUrl,
      headingFontUrl: app.headingFont ? `${assets}/public/${app.headingFont}` : undefined,
      by: existing?.by ?? app.name,
      description: existing?.description ?? '',
      category: existing?.category ?? 'Live worlds',
      viewers: '',
      source: 'Live video',
      nextSession: playback?.nextSession ?? existing?.nextSession,
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
        endpoint: `/api/channels/${app.slug}/preview`,
        backdropModule: app.backdrop ? `${assets}/backdrop.js` : undefined,
        poster: app.poster ? `${assets}/public/${app.poster}` : undefined,
      },
      previewStatus: playback ? (playback.live ? 'live' : 'off-air') : 'unavailable',
    }
  })
  return [...appChannels, ...merged.values()]
})
