import type { Channel } from './data'

export function ChannelHeadingFonts({ channels }: { channels: Channel[] }) {
  const rules = channels.flatMap(({ slug, heading, headingFontUrl, headingFontFallbackUrl }) => {
    const sources = [headingFontUrl, headingFontFallbackUrl].flatMap(url =>
      url ? [`url(${JSON.stringify(url).replace(/</g, '\\3c ')})`] : [],
    )
    if (!sources.length) return []
    // Catalog URLs and slugs have already been validated by the app registry.
    return `@font-face{font-family:${JSON.stringify('Channel ' + slug)};src:${sources.join(',')};font-weight:${heading?.fontWeight ?? 'normal'};font-display:swap}`
  })
  return rules.length ? <style>{rules.join('\n')}</style> : null
}
