import {NextResponse} from 'next/server'
import {extractClientIp, sanitizeIp} from '@/lib/leads/ip-utils'

export const runtime = 'nodejs'

const MAX_BODY_BYTES = 16 * 1024

const MIXPANEL_TRACK_URL = 'https://api.mixpanel.com/track'

function validBrowserOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return process.env.NODE_ENV !== 'production'
  if (process.env.NODE_ENV !== 'production') {
    try {
      const hostname = new URL(origin).hostname
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
      ) {
        return true
      }
    } catch {
      return false
    }
  }
  const allowed = new Set([
    new URL(request.url).origin,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
    ...(process.env.LEADS_ALLOWED_ORIGINS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  ].filter(Boolean))
  return allowed.has(origin)
}

type TrackBody = {
  event: string
  properties: Record<string, unknown>
}

export async function POST(request: Request) {
  if (!validBrowserOrigin(request)) {
    return NextResponse.json({ok: false, error: 'invalid origin'}, {status: 403})
  }
  const token =
    process.env.MIXPANEL_PROJECT_TOKEN || process.env.NEXT_PUBLIC_MIXPANEL_TOKEN
  if (!token) {
    return NextResponse.json(
      {ok: false, error: 'analytics is not configured'},
      {status: 503},
    )
  }
  const declaredLength = Number(request.headers.get('content-length') || 0)
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ok: false, error: 'request is too large'}, {status: 413})
  }
  const rawBody = await request.text()
  if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) {
    return NextResponse.json({ok: false, error: 'request is too large'}, {status: 413})
  }
  let body: TrackBody
  try {
    const parsed = JSON.parse(rawBody) as TrackBody
    if (typeof parsed.event !== 'string' || !parsed.event.trim()) {
      throw new Error('invalid event')
    }
    if (typeof parsed.properties !== 'object' || parsed.properties === null) {
      throw new Error('invalid properties')
    }
    body = parsed
  } catch {
    return NextResponse.json({ok: false, error: 'invalid request body'}, {status: 400})
  }
  let clientIp: string | null = null
  try {
    clientIp = sanitizeIp(extractClientIp(request))
  } catch (error) {
    console.error('Error extracting client IP for analytics:', error)
  }
  const mixpanelProperties: Record<string, unknown> = {
    token,
    ...body.properties,
    time: Math.floor(Date.now() / 1000),
  }
  if (clientIp) {
    mixpanelProperties.ip = clientIp
  }
  const mixpanelResponse = await fetch(MIXPANEL_TRACK_URL, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify([
      {
        event: body.event,
        properties: mixpanelProperties,
      },
    ]),
    cache: 'no-store',
  })
  if (!mixpanelResponse.ok) {
    return NextResponse.json(
      {ok: false, error: 'analytics upstream failed'},
      {status: 502},
    )
  }
  return NextResponse.json({ok: true})
}
