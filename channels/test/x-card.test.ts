import { describe, expect, it, vi } from 'vitest'
import type { Channel } from '../components/channels/data'
import nextConfig from '../next.config'
import { NextRequest } from 'next/server'
import { config as proxyConfig, proxy } from '../proxy'
import { openFullRoom, playerMetadata, requestOrigin, roomMetadata, X_PLAYER_SIZE } from '../lib/x-card'

const origin = new URL('https://channels.example')
const base = { title: 'Bears · Bears', description: 'A forest show.' }
const room = {
  slug: 'bears',
  title: 'Bears',
  app: { entry: '/channel-apps/bears/watch.js' },
  preview: { name: 'Bears', endpoint: '/api/channels/bears/preview', poster: '/channel-apps/bears/public/bears/forest-1216.webp' },
} as Channel

describe('requestOrigin', () => {
  it('uses the forwarded host and protocol from the edge', () => {
    const headers = new Headers({ host: 'internal:4000', 'x-forwarded-host': 'Channels.Example, proxy', 'x-forwarded-proto': 'https,http' })
    expect(requestOrigin(headers).href).toBe('https://channels.example/')
  })

  it('defaults to https and keeps a port', () => {
    expect(requestOrigin(new Headers({ host: 'localhost:4000' })).href).toBe('https://localhost:4000/')
  })

  it.each([
    [{}],
    [{ host: 'channels.example', 'x-forwarded-proto': 'javascript' }],
    [{ host: 'channels.example/evil' }],
    [{ host: 'user@channels.example' }],
  ])('rejects an unusable origin %j', (values) => {
    expect(() => requestOrigin(new Headers(values))).toThrow(/x-card/)
  })
})

describe('roomMetadata', () => {
  it('adds Player Card and Open Graph tags with absolute URLs for program apps', () => {
    expect(roomMetadata(room, origin, base)).toEqual({
      ...base,
      openGraph: { ...base, url: 'https://channels.example/bears', images: ['https://channels.example/channel-apps/bears/public/bears/forest-1216.webp'] },
      twitter: { card: 'player', ...base, images: ['https://channels.example/channel-apps/bears/public/bears/forest-1216.webp'] },
      other: {
        'twitter:player': 'https://channels.example/embed/bears?utm_source=x&utm_medium=player_card&utm_campaign=bears',
        'twitter:player:width': String(X_PLAYER_SIZE),
        'twitter:player:height': String(X_PLAYER_SIZE),
      },
    })
  })

  it('keeps exactly the base metadata for channels that are not embeddable', () => {
    expect(roomMetadata({ ...room, app: undefined }, origin, base)).toBe(base)
    expect(roomMetadata({ ...room, preview: undefined }, origin, base).twitter).toMatchObject({ card: 'player' })
  })

  it('shares the watch path rather than the currently tuned program', () => {
    const path = `/g/${'z'.repeat(32)}`
    const metadata = playerMetadata(path, '/poster.webp', origin, base, 'watch_party')
    expect(metadata.openGraph).toMatchObject({ url: new URL(path, origin).href })
    expect(metadata.other?.['twitter:player']).toBe(`${origin.origin}/embed${path}?utm_source=x&utm_medium=player_card&utm_campaign=watch_party`)
  })
})

describe('openFullRoom', () => {
  const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})

  it('opens the full room in a new tab when framed', () => {
    const target = { top: {}, self: {}, open: vi.fn(), location: { assign: vi.fn() } }
    openFullRoom('bears', target)
    expect(target.open).toHaveBeenCalledWith('/bears', '_blank', 'noopener')
    expect(target.location.assign).not.toHaveBeenCalled()
    expect(debug).toHaveBeenCalledWith('[channels embed] sign-in handoff', { slug: 'bears', framed: true })
  })

  it('navigates the same tab when top-level', () => {
    const self = {}
    const target = { top: self, self, open: vi.fn(), location: { assign: vi.fn() } }
    openFullRoom('bears', target)
    expect(target.location.assign).toHaveBeenCalledWith('/bears')
    expect(target.open).not.toHaveBeenCalled()
  })
})

describe('frame headers', () => {
  it('lets X frame only the embed player route', async () => {
    const rules = await nextConfig.headers!()
    expect(rules.some((rule) => rule.headers.some(({ value }) => value.includes('frame-ancestors')))).toBe(false)
    expect(proxyConfig.matcher).toContain('/embed/:slug')
    expect(proxy(new NextRequest('https://channels.example/embed/bears')).headers.get('content-security-policy'))
      .toBe("frame-ancestors 'self' https://x.com https://*.x.com https://twitter.com https://*.twitter.com")
    expect(rules.find(({ source }) => source === '/notifications/verify')!.headers).toHaveLength(3)
    expect(rules.flatMap(({ headers }) => headers).some(({ key }) => key === 'X-Frame-Options')).toBe(false)
  })

  it('does not widen the standard card even with duplicate variant parameters', () => {
    vi.stubEnv('CHANNELS_PREVIEW_FRAME_ORIGINS', 'https://partner.example')
    try {
      const headers = (query: string) => proxy(new NextRequest(`https://channels.example/embed/bears?${query}`)).headers
      expect(headers('variant=preview').get('content-security-policy')).toContain('https://partner.example')
      expect(headers('variant=preview&variant=preview').get('content-security-policy')).not.toContain('https://partner.example')
      expect(headers('variant=preview').get('cache-control')).toBe('private, no-store')
      expect(proxy(new NextRequest(`https://channels.example/embed/g/${'a'.repeat(32)}?variant=preview`)).headers
        .get('content-security-policy')).not.toContain('https://partner.example')
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
