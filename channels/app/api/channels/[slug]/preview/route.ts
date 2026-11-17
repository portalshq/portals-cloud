import { getChannelApps, getChannelPreview } from '../../../../../lib/channel-apps'
import { readProgramMetadata } from '@portalshq/channel-registry'
import { centralDb } from '../../../../../lib/admin/db'
import { adminEnv } from '../../../../../lib/admin/env'

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const app = (await getChannelApps()).get(slug)
  let preview = app ? await getChannelPreview(app) : null
  // The program row wins over a stale app cache. If central is unavailable,
  // the app's last known public copy is still usable.
  if (preview?.program && adminEnv().centralDatabaseUrl) {
    try {
      const pool = centralDb()
      const metadata = await readProgramMetadata((sql, values) => {
        const request = { text: sql, values, query_timeout: 1_500 }
        return pool.query(request)
      }, preview.program.id)
      if (metadata) preview = { ...preview, program: {
        ...preview.program,
        ...(metadata.description !== null ? { description: metadata.description } : {}),
        ...(metadata.tagline !== null ? { tagline: metadata.tagline } : {}),
      } }
    } catch {
      // Playback and the last known public metadata remain available.
    }
  }
  return Response.json(preview, {
    status: !app ? 404 : preview ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  })
}
