import type { CSSProperties } from 'react'
import { BookOpen, Gamepad2, GraduationCap, Radio } from 'lucide-react'

export type PlaybackPreview = {
  live: boolean
  stream?: string
  previewVideo?: string
  nextSession?: string
  program?: { id: string; description?: string; tagline?: string }
}

export type ChannelApp = {
  entry: string
  legacyMountExport?: string
  theme?: 'light'
}

export type ChannelHeading = Pick<CSSProperties, 'fontFamily' | 'fontWeight'>

export type Channel = {
  slug: string
  programId?: string
  title: string
  heading?: ChannelHeading
  headingFontUrl?: string
  headingFontFallbackUrl?: string
  by: string
  description: string
  tagline?: string
  /** Preserves the existing room-page metadata independently of promotional copy. */
  metadataDescription?: string
  category: string
  live?: boolean
  viewers: string
  /** Human label for what powers the channel. Never an internal package name. */
  source: string
  stream?: string
  previewVideo?: string
  nextSession?: string
  app?: ChannelApp
  preview?: {
    endpoint: string
    poster?: string
    backdropModule?: string
    name?: string
  }
  previewStatus?: 'live' | 'off-air' | 'unavailable'
}

/* Session starts render in UTC everywhere: the schedule is published in UTC
   and the zone is clearer stated than implied. */
export function formatSessionStart(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })
    .format(new Date(iso)) + ' UTC'
}

/* The session card speaks like the program's off-air card: a day the viewer
   already owns ("Today 8:00 PM") before a dated one — both in the viewer's
   own zone, which a one-line card can trust. The meta line keeps the stated
   UTC form. */
export function formatSessionTime(iso: string, now = new Date()): string {
  const start = new Date(iso)
  if (Number.isNaN(start.getTime())) return ''
  const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(start)
  if (start.toDateString() === now.toDateString()) return `Today ${time}`
  const day = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(start)
  return `${day}, ${time}`
}

/* A channel is off-air when there is nothing to watch. App channels learn it
   from the preview endpoint — 'off-air' is the app's own report, while
   'unavailable' only means the report could not be fetched. Catalog channels
   without playback plumbing have nothing to preview whenever they are not
   live. */
export function channelOffAir(channel: Channel): boolean {
  if (channel.previewStatus !== undefined) return channel.previewStatus === 'off-air'
  return !channel.live && !channel.app && !channel.stream && !channel.previewVideo && !channel.preview
}

/* Where an entry point takes the reader. Off-air channels have no program to
   enter, so they open their feed panel — the panel already shows the channel
   room content and scrolls on to the rest of the feed. On air, the room URL
   still mounts the program. */
export function channelEntryHref(channel: Channel): string {
  return channelOffAir(channel) ? `/#channel-${channel.slug}` : `/${channel.slug}`
}

export const PLACEHOLDER_STREAM =
  'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8'
export const BUNNY_STREAM = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'

export const channels: Channel[] = [
  {
    slug: 'night-shift',
    title: 'Night Shift FM',
    by: 'B-Side Radio',
    description: 'Choose the next track, call the booth, leave a note for dawn.',
    category: 'Live worlds',
    live: true,
    viewers: '887 listening',
    source: 'Live radio',
    stream: BUNNY_STREAM,
  },
  {
    slug: 'signal-syndicate',
    title: 'Signal Syndicate',
    by: 'Future Arcade',
    description: 'A cooperative relay race through an impossible broadcast station.',
    category: 'Play',
    viewers: '614 playing',
    source: 'Co-op play',
    stream: BUNNY_STREAM,
  },
  {
    slug: 'unfolding',
    title: 'Unfolding',
    by: 'Studio Chisel',
    description: 'A playable essay about memory, maps, and the cities we invent.',
    category: 'Stories',
    viewers: '1.1k exploring',
    source: 'Interactive story',
    stream: PLACEHOLDER_STREAM,
  },
  {
    slug: 'field-notes',
    title: 'Field Notes: The Pacific',
    by: 'Arc & Field',
    description: 'A documentary assembled live, by voices from the waterline.',
    category: 'Stories',
    viewers: 'New episode Friday',
    source: 'Live video',
    stream: BUNNY_STREAM,
  },
  {
    slug: 'little-planet',
    title: 'Little Planet Lab',
    by: 'Common Room',
    description: 'A weekly world-building room for curious young architects.',
    category: 'Learning',
    viewers: 'Starts in 42 min',
    source: 'Workshops',
    stream: PLACEHOLDER_STREAM,
  },
]

export const filters = ['Live now', 'Play', 'Stories', 'Learning'] as const
export type Filter = (typeof filters)[number]

/* Each filter is an icon with its label set underneath it. */
export const filterIcons = {
  'Live now': { icon: Radio, size: 19 },
  Play: { icon: Gamepad2, size: 19 },
  Stories: { icon: BookOpen, size: 17 },
  Learning: { icon: GraduationCap, size: 19 },
} as const

export const browseCopy = {
  heading: "What's live now",
  featuredLine: 'Broadcast around the clock. Watch the story change with everyone else who is here.',
  detailLede:
    'Places to gather, play, watch, and leave a mark. Each one runs itself, all day and all night.',
}

/* The featured channel owns the stage; the grid shows everything else in the
   current filter/search scope. */
export function gridChannels(
  channels: Channel[],
  featured: Channel | undefined,
  filter: Filter | null,
  query: string,
): Channel[] {
  const needle = query.trim().toLowerCase()
  return channels.filter((channel) => {
    if (channel.slug === featured?.slug) return false
    const matchesFilter =
      filter === null || (filter === 'Live now' ? channel.live : channel.category === filter)
    const haystack = `${channel.title} ${channel.by} ${channel.category}`.toLowerCase()
    return matchesFilter && haystack.includes(needle)
  })
}
