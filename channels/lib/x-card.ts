import type { Metadata } from 'next'
import type { Channel } from '../components/channels/data'

/* X Player Cards: a program room shared on X plays inside the post. The room
   page (`/<slug>`) carries the card tags; X frames the slim player route
   (`/embed/<slug>`), the only route allowed to be framed (see next.config.ts). */

export const X_PLAYER_SIZE = 480
export const X_CARD_FALLBACK_IMAGE = '/Luminous%20Mirage_%20Futuristic%20Abstract%20Scene.jpeg'

/** Public origin of the current request. The hosting edge sets Host (and the
 *  forwarded headers behind a proxy); anything that is not a bare http(s)
 *  host fails loudly rather than producing a broken absolute URL. */
export function requestOrigin(headers: Headers): URL {
  const host = (headers.get('x-forwarded-host') ?? headers.get('host'))?.split(',')[0].trim().toLowerCase()
  const protocol = headers.get('x-forwarded-proto')?.split(',')[0].trim().toLowerCase() || 'https'
  if (!host || (protocol !== 'https' && protocol !== 'http')) {
    throw new Error(`[x-card] Request has no usable origin (host=${host ?? 'missing'}, proto=${protocol})`)
  }
  const origin = new URL(`${protocol}://${host}`)
  if (origin.host !== host) throw new Error(`[x-card] Request host is not a bare host: ${host}`)
  return origin
}

type RoomMetadata = { title: string; description: string }

/** Adds Player Card and Open Graph tags for embeddable program rooms. */
export function roomMetadata(channel: Channel, origin: URL, base: RoomMetadata): Metadata {
  if (!channel.app) return base
  return playerMetadata(`/${channel.slug}`, channel.preview?.poster ?? X_CARD_FALLBACK_IMAGE, origin, base, channel.slug)
}

export function playerMetadata(path: string, poster: string, origin: URL, base: RoomMetadata, campaign: string): Metadata {
  const image = new URL(poster, origin).href
  const player = new URL(`/embed${path}`, origin)
  player.search = new URLSearchParams({ utm_source: 'x', utm_medium: 'player_card', utm_campaign: campaign }).toString()
  return {
    ...base,
    openGraph: { ...base, url: new URL(path, origin).href, images: [image] },
    twitter: { card: 'player', ...base, images: [image] },
    // Next's `twitter.players` requires a raw media `streamUrl`; the player is a page.
    other: {
      'twitter:player': player.href,
      'twitter:player:width': String(X_PLAYER_SIZE),
      'twitter:player:height': String(X_PLAYER_SIZE),
    },
  }
}

type HandoffWindow = { top: unknown; self: unknown; open: Window['open']; location: Pick<Location, 'assign'> }

/** Sign-in cannot complete inside the X frame (gateway redirect, partitioned
 *  storage), so the embed hands off to the full room: a new tab when framed
 *  (desktop card), the same tab when top-level (X's in-app browser). */
export function openFullRoom(slug: string, target: HandoffWindow = window): void {
  const url = `/${slug}`
  const framed = target.top !== target.self
  console.debug('[channels embed] sign-in handoff', { slug: slug.startsWith('g/') ? 'group' : slug, framed })
  if (framed) target.open(url, '_blank', 'noopener')
  else target.location.assign(url)
}
