import { getChannelApps } from '../../../../lib/channel-apps'

const buildAsset = /^(watch\.(js|css)|backdrop\.js|assets\/[\w.-]+\.(js|css|wasm|woff2?|svg|png|jpe?g|webp|avif|gif))$/

export async function GET(request: Request, { params }: { params: Promise<{ slug: string; path: string[] }> }) {
  const { slug, path: segments } = await params
  const app = (await getChannelApps()).get(slug)
  if (!app) return new Response(null, { status: 404 })
  const path = segments.join('/')
  const publicPath = path.startsWith('public/') ? path.slice('public/'.length) : ''
  if (!buildAsset.test(path) && !app.publicAssets.includes(publicPath)) {
    return new Response(null, { status: 404 })
  }
  const url = new URL(publicPath ? '/' + publicPath : '/channel-app/' + path, app.origin)
  try {
    const upstream = await fetch(url, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]),
    })
    if (!upstream.ok) {
      await upstream.body?.cancel()
      return new Response(null, { status: upstream.status })
    }
    return new Response(upstream.body, {
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
        'Cache-Control': path.startsWith('assets/') ? 'public, max-age=31536000, immutable' : publicPath && publicPath === app.headingFont ? 'public, max-age=604800' : 'public, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return new Response(null, { status: 502 })
  }
}
