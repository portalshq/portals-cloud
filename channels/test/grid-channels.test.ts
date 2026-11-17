import { describe, expect, it } from 'vitest'
import { gridChannels, type Channel } from '../components/channels/data'

const channel = (slug: string, extra: Partial<Channel> = {}): Channel => ({
  slug,
  title: `Title ${slug}`,
  by: `By ${slug}`,
  description: '',
  metadataDescription: '',
  category: 'Stories',
  live: false,
  viewers: '',
  source: 'Channel',
  ...extra,
})

describe('gridChannels', () => {
  it('omits the featured channel from the grid', () => {
    const channels = [channel('featured'), channel('other')]
    expect(gridChannels(channels, channels[0], null, '').map((c) => c.slug)).toEqual(['other'])
  })

  it('keeps the featured channel out even when it matches the filter and query', () => {
    const featured = channel('featured', { live: true })
    const other = channel('other', { live: true })
    expect(gridChannels([featured, other], featured, 'Live now', 'title')).toEqual([other])
  })

  it('shows everything when there is no featured channel', () => {
    const channels = [channel('a'), channel('b')]
    expect(gridChannels(channels, undefined, null, '')).toEqual(channels)
  })
})
