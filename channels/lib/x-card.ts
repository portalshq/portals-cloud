import type { Metadata } from 'next'
import type { Channel } from '../components/channels/data'

/* X Player Cards: a program room shared on X plays inside the post. The room
   page (`/<slug>`) carries the card tags; X frames the slim player route
   (`/embed/<slug>`), the only route allowed to be framed (see next.config.ts). */

export const X_PLAYER_SIZE = 480

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

/** Adds Player Card and Open Graph tags for embeddable program rooms (an app
 *  with a poster). Other channels keep exactly the base metadata. */
export function roomMetadata(channel: Channel, origin: URL, base: RoomMetadata): Metadata {
  const poster = channel.preview?.poster
  if (!channel.app || !poster) return base
  const image = new URL(poster, origin).href
  const player = new URL(`/embed/${channel.slug}`, origin)
  player.search = new URLSearchParams({ utm_source: 'x', utm_medium: 'player_card', utm_campaign: channel.slug }).toString()
  return {
    ...base,
    openGraph: { ...base, url: new URL(`/${channel.slug}`, origin).href, images: [image] },
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
  console.debug('[channels embed] sign-in handoff', { slug, framed })
  if (framed) target.open(url, '_blank', 'noopener')
  else target.location.assign(url)
}
