import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makePool, stubAdminEnv } from './helpers'

beforeEach(() => {
  vi.resetModules()
  stubAdminEnv()
  vi.stubEnv('CHANNELS_APPS', '')
})

afterEach(async () => {
  const { setPoolsForTest } = await import('../lib/admin/db')
  setPoolsForTest({ central: null })
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('public catalog', () => {
  it('merges central entries by slug, preserves other mocks, and uses Bears playback state', async () => {
    const pool = makePool(() => ({ rows: [
      { channel_id: 'bears', program_name: 'Bears live', station_name: 'Wildlife', scheduled_live: true, next_start: null },
      { channel_id: 'night-shift', program_name: 'Night Shift Central', station_name: null, scheduled_live: false, next_start: null },
    ] }))
    const { setPoolsForTest } = await import('../lib/admin/db')
    setPoolsForTest({ central: pool })
    vi.stubEnv('CHANNELS_CATALOG_STATION_ID', 'public-station')
    const next = '2027-01-03T20:00:00.000Z'
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      playback: null,
      guestToken: 'private-guest',
      nextSession: { startsAt: next, streamUrl: 'https://bears.test/?guest=private-guest' },
    })))

    const { getChannelCatalog } = await import('../lib/catalog')
    const catalog = await getChannelCatalog()
    expect(catalog[0]).toMatchObject({
      slug: 'bears', title: 'Bears live', app: { entry: '/channel-apps/bears/watch.js', legacyMountExport: 'mountBears', theme: 'light' }, live: false, nextSession: next, previewStatus: 'off-air',
    })
    expect(catalog[0].headingFontUrl).toBe('/channel-apps/bears/public/fonts/baloo-2-latin-700-v1.woff2')
    expect(catalog[0].heading).toEqual({ fontFamily: '"Channel bears", "Baloo 2", sans-serif', fontWeight: 700 })
    expect(catalog.filter(({ slug }) => slug === 'night-shift')).toEqual([
      expect.objectContaining({ title: 'Night Shift Central', live: false }),
    ])
    expect(catalog.find(({ slug }) => slug === 'night-shift')?.stream).toBeUndefined()
    expect(catalog.some(({ slug }) => slug === 'unfolding')).toBe(true)
    expect(JSON.stringify(catalog)).not.toContain('private-guest')
    expect(pool.query).toHaveBeenCalledWith(expect.any(String), ['public-station'])
  })
})

describe('channel app preview', () => {
  it('refreshes the public preview from the app and clears an expired stream when playback stops', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    const next = '2027-01-03T20:00:00.000Z'
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({
        playback: { kind: 'video', url: 'https://media.test/demo.mp4' },
        guestToken: 'private-guest',
      }))
      .mockResolvedValueOnce(Response.json({
        playback: null,
        nextSession: { startsAt: next, streamUrl: 'https://bears.test/?guest=private-guest' },
      }))
      .mockResolvedValueOnce(Response.json({
        playback: { playbackManifestUrl: 'https://media.test/live.m3u8' },
      }))
    vi.stubGlobal('fetch', fetch)

    try {
      const { GET } = await import('../app/api/channels/[slug]/preview/route')
      const preview = () => GET(new Request('https://channels.test/api/channels/bears/preview'), { params: Promise.resolve({ slug: 'bears' }) })
      const demo = await preview()
      expect(demo.headers.get('cache-control')).toBe('no-store')
      expect(await demo.json()).toEqual({ live: true, previewVideo: 'https://media.test/demo.mp4' })
      expect(await (await preview()).json()).toEqual({ live: true, previewVideo: 'https://media.test/demo.mp4' })
      expect(fetch).toHaveBeenCalledTimes(1)

      now.mockReturnValue(1_015_000)
      expect(await (await preview()).json()).toEqual({ live: false, nextSession: next })
      now.mockReturnValue(1_030_000)
      expect(await (await preview()).json()).toEqual({ live: true, stream: 'https://media.test/live.m3u8' })
      expect(fetch).toHaveBeenCalledWith(new URL('http://bears.test/api/channel'), expect.any(Object))
    } finally {
      now.mockRestore()
    }
  })

  it('proxies the backdrop module as a channel asset', async () => {
    const fetch = vi.fn(async () => new Response('export function mountBackdrop() {}', {
      headers: { 'Content-Type': 'text/javascript' },
    }))
    vi.stubGlobal('fetch', fetch)

    const { GET } = await import('../app/channel-apps/[slug]/[...path]/route')
    const response = await GET(new Request('https://channels.test/channel-apps/bears/backdrop.js'), {
      params: Promise.resolve({ slug: 'bears', path: ['backdrop.js'] }),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/javascript')
    expect(fetch).toHaveBeenCalledWith(new URL('http://bears.test/channel-app/backdrop.js'), expect.any(Object))
  })

  it('reports an upstream failure separately from off-air playback', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 502 })))
    const { GET } = await import('../app/api/channels/[slug]/preview/route')
    const response = await GET(new Request('https://channels.test/api/channels/bears/preview'), { params: Promise.resolve({ slug: 'bears' }) })
    expect(response.status).toBe(503)
    expect(await response.json()).toBeNull()
  })
})

describe('channel viewer proxy', () => {
  it('streams the audience response and forwards only trusted request headers', async () => {
    vi.stubEnv('CHANNELS_TRUSTED_CLIENT_IP_HEADER', 'x-test-edge-ip')
    const fetch = vi.fn(async (_url: URL, _options: RequestInit) => new Response('data: ready\n\n', {
      headers: { 'Content-Type': 'text/event-stream' },
    }))
    vi.stubGlobal('fetch', fetch)
    const { GET } = await import('../app/api/channels/[slug]/[...path]/route')
    const response = await GET(new Request('https://channels.test/api/channels/bears/interactions/stream?after=4', {
      headers: { 'x-test-edge-ip': '192.0.2.10', 'x-forwarded-for': '192.0.2.11', cookie: 'private=cookie' },
    }), { params: Promise.resolve({ slug: 'bears', path: ['interactions', 'stream'] }) })

    expect(await response.text()).toBe('data: ready\n\n')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(fetch).toHaveBeenCalledWith(new URL('http://bears.test/api/interactions/stream?after=4'), expect.objectContaining({
      headers: expect.any(Headers),
    }))
    const [, options] = fetch.mock.calls[0]
    const headers = new Headers(options.headers)
    expect(headers.get('x-forwarded-for')).toBe('192.0.2.10')
    expect(headers.has('cookie')).toBe(false)
  })

  it('keeps privileged routes outside the public proxy', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const { POST } = await import('../app/api/channels/[slug]/[...path]/route')
    const response = await POST(new Request('https://channels.test/api/channels/bears/production/start', {
      method: 'POST',
    }), { params: Promise.resolve({ slug: 'bears', path: ['production', 'start'] }) })
    expect(response.status).toBe(404)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('registered channel apps', () => {
  it('lists a second app with its own bundle, preview, and public assets', async () => {
    vi.stubEnv('ADMIN_CENTRAL_DATABASE_URL', '')
    vi.stubEnv('CHANNELS_APPS', JSON.stringify({
      garden: {
        origin: 'https://garden.test', name: 'Garden', backdrop: true, poster: 'images/garden.webp',
        heading: { fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: '99px', fontUrl: 'https://garden.test/fonts/heading.woff2' },
      },
    }))
    const fetch = vi.fn(async (url: URL) => {
      if (url.pathname === '/images/garden.webp') return new Response('poster')
      return Response.json({ playback: url.hostname === 'garden.test' ? { kind: 'video', url: '/demo.mp4' } : null })
    })
    vi.stubGlobal('fetch', fetch)
    const { getChannelCatalog } = await import('../lib/catalog')
    const catalog = await getChannelCatalog()
    const garden = catalog.find(({ slug }) => slug === 'garden')
    expect(garden?.heading).toEqual({ fontFamily: '"Channel garden", Georgia, serif', fontWeight: 700 })
    expect(garden?.headingFontUrl).toBeUndefined()
    expect(garden?.headingFontFallbackUrl).toBe('https://garden.test/fonts/heading.woff2')
    expect(garden).toMatchObject({
      title: 'Garden',
      app: { entry: '/channel-apps/garden/watch.js' },
      preview: {
        endpoint: '/api/channels/garden/preview',
        poster: '/channel-apps/garden/public/images/garden.webp',
        backdropModule: '/channel-apps/garden/backdrop.js',
      },
      previewVideo: 'https://garden.test/demo.mp4',
    })
    const { GET: asset } = await import('../app/channel-apps/[slug]/[...path]/route')
    const poster = new Request('https://channels.test/channel-apps/garden/public/images/garden.webp')
    const path = ['public', 'images', 'garden.webp']
    expect((await asset(poster, { params: Promise.resolve({ slug: 'garden', path }) })).status).toBe(200)
    expect((await asset(poster, { params: Promise.resolve({ slug: 'bears', path }) })).status).toBe(404)

    const { GET: api } = await import('../app/api/channels/[slug]/[...path]/route')
    const request = new Request('https://channels.test/api/channels/garden/channel')
    expect((await api(request, { params: Promise.resolve({ slug: 'garden', path: ['channel'] }) })).status).toBe(200)
    expect(fetch).toHaveBeenLastCalledWith(new URL('https://garden.test/api/channel'), expect.any(Object))
    const calls = fetch.mock.calls.length
    expect((await api(request, { params: Promise.resolve({ slug: 'unknown', path: ['channel'] }) })).status).toBe(404)
    expect(fetch).toHaveBeenCalledTimes(calls)
  })
})
