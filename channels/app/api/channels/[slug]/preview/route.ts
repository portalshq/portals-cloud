import { getChannelApps, getChannelPreview } from '../../../../../lib/channel-apps'
import { createHash } from 'node:crypto'

const previews = new Map<string, { until: number; result: Promise<{ body: unknown; status: number }> }>()

async function loadPreview(slug: string) {
  const cached = previews.get(slug)
  if (cached && cached.until > Date.now()) return cached.result
  const result = (async () => {
    const app = (await getChannelApps()).get(slug)
    const preview = app ? await getChannelPreview(app) : null
    return { body: preview, status: !app ? 404 : preview ? 200 : 503 }
  })()
  if (previews.size >= 250) {
    const now = Date.now()
    for (const [key, value] of previews) if (value.until <= now) previews.delete(key)
    while (previews.size >= 250) previews.delete(previews.keys().next().value!)
  }
  previews.set(slug, { until: Date.now() + 5_000, result })
  void result.catch(() => {
    if (previews.get(slug)?.result === result) previews.delete(slug)
  })
  return result
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { body, status } = await loadPreview(slug)
  const serialized = JSON.stringify(body)
  const etag = `"${createHash('sha256').update(serialized).digest('base64url')}"`
  const headers = { ETag: etag, 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=30' }
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers })
  return new Response(serialized, { status, headers: { ...headers, 'Content-Type': 'application/json' } })
}
