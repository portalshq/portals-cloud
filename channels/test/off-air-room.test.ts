import { describe, expect, it } from 'vitest'
import {
  channelEntryHref,
  channelOffAir,
  formatSessionStart,
  formatSessionTime,
  type Channel,
} from '../components/channels/data'

const channel = (slug: string, extra: Partial<Channel> = {}): Channel => ({
  slug,
  title: `Title ${slug}`,
  by: `By ${slug}`,
  description: '',
  category: 'Live worlds',
  viewers: '',
  source: 'Channel',
  ...extra,
})

const appChannel = (slug: string, previewStatus: Channel['previewStatus'], extra: Partial<Channel> = {}): Channel =>
  channel(slug, {
    app: { entry: `/channel-apps/${slug}/watch.js` },
    preview: { endpoint: `/api/channels/${slug}/preview` },
    previewStatus,
    ...extra,
  })

describe('channelOffAir', () => {
  it('is off-air when an app channel reports no playback', () => {
    expect(channelOffAir(appChannel('bears', 'off-air'))).toBe(true)
  })

  it('is not off-air while an app channel is live or its preview is unreachable', () => {
    expect(channelOffAir(appChannel('bears', 'live', { live: true, stream: 'https://media.test/live.m3u8' }))).toBe(false)
    expect(channelOffAir(appChannel('bears', 'unavailable'))).toBe(false)
  })

  it('lets the reported status win over preview assets that stayed on the entry', () => {
    const bears = appChannel('bears', 'off-air', { previewVideo: 'https://media.test/demo.mp4' })
    expect(channelOffAir(bears)).toBe(true)
  })

  it('is off-air for a catalog channel that is not live and carries nothing playable', () => {
    const scheduled = channel('night-shift', { live: false, programId: 'night-shift-live', nextSession: '2027-01-03T20:00:00.000Z' })
    expect(channelOffAir(scheduled)).toBe(true)
  })

  it('is not off-air when a catalog channel can play, even without a live flag', () => {
    expect(channelOffAir(channel('signal-syndicate', { stream: 'https://media.test/live.m3u8' }))).toBe(false)
    expect(channelOffAir(channel('garden', { previewVideo: 'https://media.test/demo.mp4' }))).toBe(false)
    expect(channelOffAir(channel('unfolding', { preview: { endpoint: '/api/channels/unfolding/preview' } }))).toBe(false)
  })

  it('is not off-air for a live channel with no playable media', () => {
    expect(channelOffAir(channel('night-shift', { live: true }))).toBe(false)
  })

  it('is not off-air for an app channel that never reported a status', () => {
    expect(channelOffAir(channel('bears', { app: { entry: '/channel-apps/bears/watch.js' } }))).toBe(false)
  })
})

describe('channelEntryHref', () => {
  it('points off-air entries at the feed panel, which carries the room content', () => {
    expect(channelEntryHref(appChannel('bears', 'off-air'))).toBe('/#channel-bears')
    expect(channelEntryHref(channel('night-shift', { live: false }))).toBe('/#channel-night-shift')
  })

  it('points live and unknown-status entries at the room', () => {
    expect(channelEntryHref(appChannel('bears', 'live', { live: true }))).toBe('/bears')
    expect(channelEntryHref(appChannel('bears', 'unavailable'))).toBe('/bears')
    expect(channelEntryHref(channel('unfolding', { stream: 'https://media.test/live.m3u8' }))).toBe('/unfolding')
  })
})

describe('formatSessionStart', () => {
  it('formats the session start as a medium date and short time in UTC', () => {
    expect(formatSessionStart('2027-01-03T20:00:00.000Z')).toBe('Jan 3, 2027, 8:00 PM UTC')
  })

  it('keeps the zone stated rather than implied', () => {
    expect(formatSessionStart('2027-06-15T08:30:00.000Z')).toMatch(/UTC$/)
  })
})

describe('formatSessionTime', () => {
  it('says Today for a session later the same day, like the program card', () => {
    const session = formatSessionTime('2027-01-03T20:00:00', new Date('2027-01-03T10:00:00'))
    expect(session.startsWith('Today')).toBe(true)
  })

  it('dates a session on another day', () => {
    const session = formatSessionTime('2027-01-03T20:00:00', new Date('2027-01-01T10:00:00'))
    expect(session.startsWith('Today')).toBe(false)
    expect(session).toContain(',')
  })

  it('returns an empty string for a start it cannot parse', () => {
    expect(formatSessionTime('not-a-date')).toBe('')
  })
})
