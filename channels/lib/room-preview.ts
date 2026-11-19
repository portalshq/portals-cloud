export type EmbedSurface = 'embed' | 'preview'
export type RoomVariant = 'preview'

/**
 * Elements a host may expose inside a mounted program room. Omitted fields
 * preserve the program's normal behaviour. Preview callers receive a fully
 * resolved object so every bundle sees the same read-only contract.
 */
export type RoomElements = {
  chatMessages?: number
  input?: boolean
  reactions?: boolean
  forms?: boolean
  actions?: boolean
}

export type ResolvedRoomElements = Readonly<RoomElements>

export const PREVIEW_ELEMENTS: Readonly<ResolvedRoomElements> = Object.freeze({
  chatMessages: 3,
  input: false,
  reactions: false,
  forms: false,
  actions: false,
})

export function embedSurface(value: string | string[] | undefined): EmbedSurface {
  return value === 'preview' ? 'preview' : 'embed'
}

const xAncestors = "frame-ancestors 'self' https://x.com https://*.x.com https://twitter.com https://*.twitter.com"

export function frameAncestors(surface: EmbedSurface, partners?: string): string {
  if (surface === 'embed' || !partners?.trim()) return xAncestors
  const origins = new Set(partners.split(',').map(value => {
    const input = value.trim()
    if (!/^https:\/\/[a-z0-9.-]+(?::[0-9]+)?\/?$/i.test(input)) {
      throw new Error('CHANNELS_PREVIEW_FRAME_ORIGINS must contain exact HTTPS origins')
    }
    return new URL(input).origin
  }))
  return `${xAncestors} ${[...origins].join(' ')}`
}

function chatCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10) {
    throw new Error('Preview chat count must be an integer between 0 and 10')
  }
  return value
}

function elementBoolean(name: keyof Omit<RoomElements, 'chatMessages'>, value: unknown): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') throw new Error(`Room element ${name} must be a boolean`)
  return value
}

/** Resolve the program-room interface once at the host seam. */
export function roomElementsFor(variant?: RoomVariant, overrides?: RoomElements): ResolvedRoomElements | undefined {
  if (!variant && !overrides) return undefined
  const base = variant === 'preview' ? PREVIEW_ELEMENTS : undefined
  const chatMessages = overrides?.chatMessages === undefined ? base?.chatMessages : chatCount(overrides.chatMessages)
  const input = elementBoolean('input', overrides?.input)
  const reactions = elementBoolean('reactions', overrides?.reactions)
  const forms = elementBoolean('forms', overrides?.forms)
  const actions = elementBoolean('actions', overrides?.actions)
  return Object.freeze({
    ...base,
    ...(chatMessages === undefined ? {} : { chatMessages }),
    ...(input === undefined ? {} : { input }),
    ...(reactions === undefined ? {} : { reactions }),
    ...(forms === undefined ? {} : { forms }),
    ...(actions === undefined ? {} : { actions }),
  })
}

/** Compatibility helper for registration validation and older callers. */
export function previewElements(chatMessages: unknown = PREVIEW_ELEMENTS.chatMessages): ResolvedRoomElements {
  return roomElementsFor('preview', { chatMessages: chatCount(chatMessages) })!
}

export type PreviewElements = ResolvedRoomElements
