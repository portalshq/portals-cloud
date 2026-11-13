import { getChannelApps, getChannelPreview } from '../../../../../lib/channel-apps'

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const app = getChannelApps().get(slug)
  const preview = app ? await getChannelPreview(app) : null
  return Response.json(preview, {
    status: !app ? 404 : preview ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  })
}
