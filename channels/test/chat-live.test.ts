import { expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => {
  let change: ((snapshot: { data?: readonly unknown[]; status: string }) => void) | undefined
  const subscription = {
    onChange: vi.fn((listener) => { change = listener; return () => undefined }),
    renew: vi.fn(),
    unsubscribe: vi.fn(),
  }
  return {
    subscribe: vi.fn(() => subscription),
    subscription,
    emit: (snapshot: { data?: readonly unknown[]; status: string }) => change?.(snapshot),
  }
})

vi.mock('@neon/realtime/client', () => ({
  createRealtimeClient: vi.fn(() => ({ subscribe: sdk.subscribe, close: vi.fn() })),
}))

import { getLiveMessages, subscribeLiveMessages } from '../components/channels/chat-live'

it('shares one live subscription per chat endpoint', async () => {
  const fetcher = vi.fn(async () => Response.json({
    url: 'wss://realtime.example/v1',
    query: { capability: 'sealed', queryFingerprint: 'chat', expiresAt: Date.now() + 300_000 },
  }))
  const first = vi.fn()
  const second = vi.fn()

  const stopFirst = subscribeLiveMessages('/api/programs/bears/chat', fetcher, first)
  const stopSecond = subscribeLiveMessages('/api/programs/bears/chat', fetcher, second)
  await vi.waitFor(() => expect(sdk.subscribe).toHaveBeenCalledTimes(1))
  expect(fetcher).toHaveBeenCalledTimes(1)

  sdk.emit({ status: 'live', data: [
    { id: '2', name: 'B', text: 'new' },
    { id: '1', name: 'A', text: 'old' },
  ] })
  expect(getLiveMessages('/api/programs/bears/chat').messages?.map(message => message.id)).toEqual(['1', '2'])
  expect(first).toHaveBeenCalled()
  expect(second).toHaveBeenCalled()

  stopFirst()
  expect(sdk.subscription.unsubscribe).not.toHaveBeenCalled()
  stopSecond()
  expect(sdk.subscription.unsubscribe).toHaveBeenCalledOnce()
})
