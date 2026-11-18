export type EmbedSurface = 'embed' | 'preview'

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

export function previewElements(chatMessages: unknown = 3) {
  if (typeof chatMessages !== 'number' || !Number.isInteger(chatMessages) || chatMessages < 0 || chatMessages > 10) {
    throw new Error('Preview chat count must be an integer between 0 and 10')
  }
  return { chatMessages, input: false, reactions: false, forms: false, actions: false } as const
}

export type PreviewElements = ReturnType<typeof previewElements>
