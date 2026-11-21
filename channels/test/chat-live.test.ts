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

import React, { act } from 'react'
import ReactDOMClient from 'react-dom/client'
// @ts-expect-error jsdom types are optional dev dependency in tests
import { JSDOM } from 'jsdom'
import { emptyLiveMessages, getLiveMessages, subscribeLiveMessages } from '../components/channels/chat-live'
import { AmbientChat, RoomChat } from '../components/channels/RoomChat'

it('renders AmbientChat and RoomChat without exceeding maximum update depth', async () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', { url: 'http://localhost' })
  const previousWindow = global.window
  const previousDoc = global.document
  try {
    Object.assign(global, {
      window: dom.window,
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
      CustomEvent: dom.window.CustomEvent,
    })
    const root = ReactDOMClient.createRoot(dom.window.document.getElementById('root')!)
    await act(async () => {
      root.render(React.createElement(AmbientChat, { programId: 'bears-live', limit: 3, active: true }))
    })
    await act(async () => {
      root.render(React.createElement(AmbientChat, { programId: 'bears-live', limit: 3, active: false }))
    })
    await act(async () => {
      root.render(React.createElement(RoomChat, { programId: 'bears-live' }))
    })
  } finally {
    global.window = previousWindow
    global.document = previousDoc
  }
})

it('returns a stable empty snapshot before a chat subscription starts', () => {
  expect(getLiveMessages('/api/programs/not-yet-subscribed/chat')).toBe(
    getLiveMessages('/api/programs/not-yet-subscribed/chat'),
  )
  expect(getLiveMessages('/api/programs/not-yet-subscribed/chat')).toBe(emptyLiveMessages)
})

it('returns a stable empty snapshot when subscribed before messages arrive', () => {
  const fetcher = vi.fn(async () => new Promise<Response>(() => {}))
  const stop = subscribeLiveMessages('/api/programs/pending/chat', fetcher, () => {})
  expect(getLiveMessages('/api/programs/pending/chat')).toBe(emptyLiveMessages)
  stop()
  const stop2 = subscribeLiveMessages('/api/programs/pending/chat', fetcher, () => {})
  expect(getLiveMessages('/api/programs/pending/chat')).toBe(emptyLiveMessages)
  stop2()
})

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
