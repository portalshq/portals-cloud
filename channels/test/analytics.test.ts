import {afterEach, describe, expect, it, vi} from 'vitest'
import {POST} from '../app/api/analytics/route'
import {channelEvents} from '../lib/analytics-contract'

const anonymousId = 'a9c7d403-354f-43b5-900d-681c14b6c261'
const event = {id: 'ce5dbd3b-99b7-40b7-b780-5e1e3dd6780d', name: channelEvents.follow, version: 1, occurredAt: '2026-01-01T00:00:00Z', provenance: 'client', properties: {channel: 'night-shift', following: true}, identity: {anonymousId}}
const request = (events: unknown[]) => new Request('https://channels.example/api/analytics', {method: 'POST', body: JSON.stringify({events})})

afterEach(() => {vi.unstubAllEnvs(); vi.unstubAllGlobals()})
describe('channel event ingestion', () => {
  it('validates and forwards an anonymous action with the stable message id', async () => {
    vi.stubEnv('CHANNELS_ANALYTICS_ENABLED', 'true'); vi.stubEnv('CHANNELS_SEGMENT_WRITE_KEY', 'testkey')
    const fetchMock = vi.fn().mockResolvedValue({ok: true}); vi.stubGlobal('fetch', fetchMock)
    expect((await POST(request([event]))).status).toBe(204)
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(sent).toMatchObject({messageId: event.id, event: event.name, anonymousId, properties: {following: true, portals_event_id: event.id, portals_provenance: 'client'}})
  })
  it('rejects fabricated server events, extra properties and user identity', async () => {
    vi.stubEnv('CHANNELS_ANALYTICS_ENABLED', 'true'); vi.stubEnv('CHANNELS_SEGMENT_WRITE_KEY', 'testkey')
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock)
    for (const invalid of [{...event, name: 'billing.purchase_settled'}, {...event, properties: {following: true, message: 'private'}}, {...event, identity: {anonymousId, userId: 'forged'}}, {...event, properties: {}}]) {
      expect((await POST(request([invalid]))).status).toBe(400)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('reports vendor outages so the browser can retry', async () => {
    vi.stubEnv('CHANNELS_ANALYTICS_ENABLED', 'true'); vi.stubEnv('CHANNELS_SEGMENT_WRITE_KEY', 'testkey')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok: false, status: 503}))
    expect((await POST(request([event]))).status).toBe(502)
  })
})
