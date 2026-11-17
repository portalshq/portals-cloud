import { isIP } from 'node:net'
import { getChannelApps } from '../../../../../lib/channel-apps'

type Context = { params: Promise<{ slug: string; path: string[] }> }

const reads = /^(channel|chat(?:\/stream)?|channels\/[A-Za-z0-9-]+\/playback|monetization\/catalog|interactions\/(choice|stream|squads\/[A-Za-z0-9-]+)|auth\/(me|session\/[A-Fa-f0-9-]+)|guides\/balance|sessions\/next\.ics|reactor\/state|entity-image|choice-images\/[a-f0-9]{64})$/
const writes = /^(chat|guides|reminders|monetization\/checkout|auth\/(session|refresh|logout|display-name)|reactor\/session|interactions\/(guest\/claim|feedback|reactions|squads|squads\/[A-Za-z0-9-]+\/join|[A-Za-z0-9-]+\/vote))$/

async function forward(request: Request, { params }: Context): Promise<Response> {
  const { slug, path: segments } = await params
  const path = segments.join('/')
  const read = request.method === 'GET'
  if (!read && request.headers.get('sec-fetch-site') === 'cross-site') {
    return new Response(null, { status: 403 })
  }
  if (!(read ? reads : writes).test(path)) return new Response(null, { status: 404 })
  const app = (await getChannelApps()).get(slug)
  if (!app) return new Response(null, { status: 404 })
  const url = new URL('/api/' + path, app.origin)
  const requestUrl = new URL(request.url)
  url.search = requestUrl.search
  const headers = new Headers({
    'X-Channel-Surface': 'channels',
    'X-Channel-Origin': request.headers.get('origin') ?? requestUrl.origin,
  })
  for (const key of ['accept', 'authorization', 'content-type', 'last-event-id', 'x-guest-token']) {
    const value = request.headers.get(key)
    if (value) headers.set(key, value)
  }
  // Only use a header overwritten by the hosting edge. Never forward a
  // browser-supplied X-Forwarded-For chain to upstream per-IP limiters.
  const ipHeader = process.env.CHANNELS_TRUSTED_CLIENT_IP_HEADER
    || (process.env.VERCEL === '1' ? 'x-vercel-forwarded-for' : '')
  const clientIp = ipHeader ? request.headers.get(ipHeader)?.trim() : undefined
  if (clientIp && isIP(clientIp)) headers.set('x-forwarded-for', clientIp)
  try {
    const init: RequestInit & { duplex?: 'half' } = {
      method: request.method,
      headers,
      cache: 'no-store',
      redirect: 'error',
      signal: path.endsWith('/stream')
        ? request.signal
        : AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]),
    }
    if (!read && request.body) {
      init.body = request.body
      init.duplex = 'half'
    }
    const upstream = await fetch(url, init)
    const cacheableChoiceImage = read && /^choice-images\/[a-f0-9]{64}$/.test(path) && upstream.ok && (upstream.headers.get('content-type') ?? '').startsWith('image/')
    const responseHeaders = new Headers({ 'Cache-Control': cacheableChoiceImage ? 'public, max-age=31536000, immutable' : 'no-store' })
    for (const key of ['content-type', 'content-disposition', 'retry-after', 'x-accel-buffering']) {
      const value = upstream.headers.get(key)
      if (value) responseHeaders.set(key, value)
    }
    if (path.endsWith('/stream')) responseHeaders.set('X-Accel-Buffering', 'no')
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })
  } catch {
    return Response.json({ error: 'Channel unavailable' }, { status: 502 })
  }
}

export const GET = forward
export const POST = forward
