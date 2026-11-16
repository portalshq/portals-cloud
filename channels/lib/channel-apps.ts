import type { ChannelHeading, PlaybackPreview } from '../components/channels/data'
import { adminEnv } from './admin/env'

export const CHANNEL_SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/
const PUBLIC_ASSET = /^(?:[\w-]+\/)*[\w-]+\.(?:png|jpe?g|webp|avif|gif|woff2?)$/i

type RegisteredApp = {
  slug: string
  origin: string
  name: string
  /** Credit line shown as the channel owner. Falls back to the app name. */
  by?: string
  theme?: 'light'
  heading?: ChannelHeading
  headingFont?: string
  headingFontFallbackUrl?: string
  backdrop: boolean
  poster?: string
  publicAssets: string[]
  legacyMountExport?: string
}

function register(slug: string, value: unknown): RegisteredApp | undefined {
  if (!CHANNEL_SLUG.test(slug) || !value || typeof value !== 'object') return
  const { origin, name, by, poster, backdrop, publicAssets, heading, theme } = value as Record<string, unknown>
  if (typeof origin !== 'string') return
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash) return
  const image = typeof poster === 'string' && PUBLIC_ASSET.test(poster) ? poster : undefined
  const { fontFamily, fontWeight, fontFile, fontUrl } = heading && typeof heading === 'object'
    ? heading as Record<string, unknown>
    : {}
  const family = typeof fontFamily === 'string' && fontFamily.trim() ? fontFamily.trim() : undefined
  const weight = typeof fontWeight === 'number' && fontWeight >= 1 && fontWeight <= 1000
    ? fontWeight
    : fontWeight === 'normal' || fontWeight === 'bold' ? fontWeight : undefined

  const headingFont = typeof fontFile === 'string' && PUBLIC_ASSET.test(fontFile)
    && /\.woff2?$/i.test(fontFile) ? fontFile : undefined

  const directFont = typeof fontUrl === 'string' && /^https?:\/\//i.test(fontUrl)
    ? mediaUrl(fontUrl, url)
    : undefined

  return {
    slug,
    theme: theme === 'light' ? 'light' : undefined,
    headingFont,
    headingFontFallbackUrl: directFont,
    heading: headingFont || directFont || family !== undefined || weight !== undefined
      ? { fontFamily: headingFont || directFont ? `"Channel ${slug}", ${family ?? 'sans-serif'}` : family, fontWeight: weight }
      : undefined,
    origin: url.origin,
    name: typeof name === 'string' && name.trim() ? name.trim() : slug,
    by: typeof by === 'string' && by.trim() ? by.trim() : undefined,
    backdrop: backdrop === true,
    poster: image,
    publicAssets: [
      ...(headingFont ? [headingFont] : []),
      ...(image ? [image] : []),
      ...(Array.isArray(publicAssets)
        ? publicAssets.filter((path): path is string => typeof path === 'string' && PUBLIC_ASSET.test(path))
        : []),
    ],
  }
}

const bearsDefaults = {
  name: 'Bears',
  theme: 'light',
  heading: { fontFamily: '"Baloo 2", sans-serif', fontWeight: 700, fontFile: 'fonts/baloo-2-latin-700-v1.woff2' },
  backdrop: true,
  poster: 'bears/forest-1216.webp',
  publicAssets: ['bears/forest-background.png'],
}

/* The 25th Chapter ebook app: Playfair Display headings and the preview
   splash are served from the app's public directory. Massively Social is the
   publisher; the program name stays "25th Chapter". */
const chapterDefaults = {
  name: '25th Chapter',
  by: 'Massively Social',
  heading: { fontFamily: '"Playfair Display", Georgia, serif', fontWeight: 600, fontFile: 'fonts/playfair-display-v40-latin.woff2' },
  poster: 'heroes.png',
  publicAssets: ['preview/2.png'],
}

const appDefaults: Record<string, Record<string, unknown>> = {
  bears: bearsDefaults,
  '25th-chapter': chapterDefaults,
}

export function getChannelApps(): Map<string, RegisteredApp> {
  const apps = new Map<string, RegisteredApp>()
  const bears = register('bears', {
    origin: adminEnv().bearsApiBaseUrl,
    ...bearsDefaults,
  })
  if (bears) apps.set(bears.slug, { ...bears, legacyMountExport: 'mountBears' })

  try {
    const config: unknown = JSON.parse(process.env.CHANNELS_APPS?.trim() || '{}')
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Expected an object')
    for (const [slug, value] of Object.entries(config)) {
      const defaults = appDefaults[slug]
      const app = register(slug, defaults && value && typeof value === 'object'
        ? { ...defaults, ...value }
        : value)
      if (app) apps.set(slug, slug === 'bears' ? { ...app, legacyMountExport: 'mountBears' } : app)
    }
  } catch {
    console.error('[channels] CHANNELS_APPS must be a JSON object keyed by channel slug')
  }
  return apps
}

function mediaUrl(value: unknown, base: URL): string | undefined {
  if (typeof value !== 'string' || !value) return undefined
  try {
    const url = new URL(value, base)
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href
  } catch {
    return undefined
  }
}

const previewCache = new Map<string, {
  origin: string
  until: number
  result: Promise<PlaybackPreview | null>
}>()

export function getChannelPreview(app: RegisteredApp): Promise<PlaybackPreview | null> {
  const url = new URL('/api/channel', app.origin)
  const cached = previewCache.get(app.slug)
  if (cached?.origin === app.origin && cached.until > Date.now()) return cached.result
  const result = (async () => {
    try {
      const response = await fetch(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(2500) })
      if (!response.ok) return null
      const { playback, nextSession: next, program: rawProgram } = await response.json()
      const program = rawProgram && typeof rawProgram === 'object' && typeof rawProgram.id === 'string'
        ? {
            id: rawProgram.id,
            ...(typeof rawProgram.description === 'string' ? { description: rawProgram.description } : {}),
            ...(typeof rawProgram.tagline === 'string' ? { tagline: rawProgram.tagline } : {}),
          }
        : undefined
      const date = typeof next?.startsAt === 'string' ? Date.parse(next.startsAt) : NaN
      const nextSession = Number.isFinite(date) ? new Date(date).toISOString() : undefined
      if (playback === null) return { live: false, nextSession, ...(program ? { program } : {}) }
      if (playback?.kind === 'reactor') return { live: true, nextSession, ...(program ? { program } : {}) }
      if (playback?.kind === 'video') {
        const previewVideo = mediaUrl(playback.url, url)
        return previewVideo ? { live: true, previewVideo, nextSession, ...(program ? { program } : {}) } : null
      }
      const stream = mediaUrl(playback?.playbackManifestUrl, url)
      return stream ? { live: true, stream, nextSession, ...(program ? { program } : {}) } : null
    } catch {
      return null
    }
  })()
  previewCache.set(app.slug, { origin: app.origin, until: Date.now() + 10_000, result })
  return result
}
