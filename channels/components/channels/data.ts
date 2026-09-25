import { BookOpen, Gamepad2, GraduationCap, Radio } from 'lucide-react'

export type Channel = {
  slug: string
  title: string
  by: string
  description: string
  category: string
  live?: boolean
  viewers: string
  /** Human label for what powers the channel. Never an internal package name. */
  source: string
  stream: string
}

/* Placeholder HLS test asset so the player is genuinely live out of the box.
   Swap `stream` per channel when real manifests exist. */
export const PLACEHOLDER_STREAM = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'

export const channels: Channel[] = [
  {
    slug: 'massively-social',
    title: 'The 25th Chapter',
    by: 'Massively Social',
    description: 'A mystery that keeps unfolding. Step in whenever you like; the story never stops.',
    category: 'Live worlds',
    live: true,
    viewers: '2.4k here now',
    source: 'Always on',
    stream: PLACEHOLDER_STREAM,
  },
  {
    slug: 'night-shift',
    title: 'Night Shift FM',
    by: 'B-Side Radio',
    description: 'Choose the next track, call the booth, leave a note for dawn.',
    category: 'Live worlds',
    live: true,
    viewers: '887 listening',
    source: 'Live radio',
    stream: PLACEHOLDER_STREAM,
  },
  {
    slug: 'signal-syndicate',
    title: 'Signal Syndicate',
    by: 'Future Arcade',
    description: 'A cooperative relay race through an impossible broadcast station.',
    category: 'Play',
    viewers: '614 playing',
    source: 'Co-op play',
    stream: PLACEHOLDER_STREAM,
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
    stream: PLACEHOLDER_STREAM,
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
  'Live now': Radio,
  Play: Gamepad2,
  Stories: BookOpen,
  Learning: GraduationCap,
} as const

export const browseCopy = {
  heading: "What's live now",
  featuredLine: 'Broadcast around the clock. Watch the story change with everyone else who is here.',
  detailLede:
    'Places to gather, play, watch, and leave a mark. Each one runs itself, all day and all night.',
}
