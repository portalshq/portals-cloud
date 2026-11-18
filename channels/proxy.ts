import { NextResponse, type NextRequest } from 'next/server'
import { embedSurface, frameAncestors } from './lib/room-preview'

export function proxy(request: NextRequest) {
  const variants = request.nextUrl.searchParams.getAll('variant')
  const response = NextResponse.next()
  const path = request.nextUrl.pathname
  if (path.startsWith('/embed/')) {
    const surface = embedSurface(!path.startsWith('/embed/g/') && variants.length === 1 ? variants[0] : undefined)
    response.headers.set('Content-Security-Policy', frameAncestors(surface, process.env.CHANNELS_PREVIEW_FRAME_ORIGINS))
  }
  if (path.startsWith('/g/') || path.startsWith('/embed/g/')) response.headers.set('Referrer-Policy', 'no-referrer')
  response.headers.set('X-Robots-Tag', 'noindex')
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

export const config = { matcher: ['/embed/:slug', '/embed/g/:code', '/g/:code'] }
