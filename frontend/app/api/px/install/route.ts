import {after, NextResponse} from 'next/server'
import {isAnonymousId, recordUniquePxEvent, sendPxTelemetryToMixpanel, type PxTelemetryProperties} from '@/lib/px-telemetry'

export const runtime = 'nodejs'

const MAX_BODY_BYTES = 4_096
const ALLOWED_PLATFORMS = new Set([
  'x86_64-unknown-linux-gnu',
  'aarch64-unknown-linux-gnu',
  'x86_64-apple-darwin',
  'aarch64-apple-darwin',
  'x86_64-pc-windows-msvc',
])

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get('content-length') || 0)
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ok: false}, {status: 413})
  }

  let body: Record<string, unknown>
  try {
    const rawBody = await request.text()
    if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) {
      return NextResponse.json({ok: false}, {status: 413})
    }
    body = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return NextResponse.json({ok: false}, {status: 400})
  }

  if (!isAnonymousId(body.install_id)) {
    return NextResponse.json({ok: false}, {status: 400})
  }
  const platform = typeof body.platform === 'string' ? body.platform : ''
  const version = typeof body.version === 'string' ? body.version.slice(0, 80) : ''
  if (!ALLOWED_PLATFORMS.has(platform) || !version) {
    return NextResponse.json({ok: false}, {status: 400})
  }
  const downloadId = isAnonymousId(body.download_id) ? body.download_id : undefined
  const properties: PxTelemetryProperties = {
    anonymousId: body.install_id,
    downloadId,
    version,
    platform,
  }

  try {
    const inserted = await recordUniquePxEvent('install', properties)
    if (inserted) after(() => sendPxTelemetryToMixpanel('install', properties))
    return NextResponse.json({ok: true, unique: inserted}, {headers: {'Cache-Control': 'no-store'}})
  } catch (error) {
    console.error('PX successful-install telemetry could not be recorded:', error)
    return NextResponse.json({ok: false}, {status: 503})
  }
}
