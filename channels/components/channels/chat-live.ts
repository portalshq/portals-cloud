'use client'

import { createRealtimeClient, type MaterializedLiveQuerySubscription, type RealtimeClient, type SealedLiveQuery } from '@neon/realtime/client'

export type ChatMessage = { id: string; name: string; text: string }
type Fetcher = (path: string, init?: RequestInit) => Promise<Response>
type Snapshot = { messages?: readonly ChatMessage[]; failed: boolean }
type LivePayload = { query: SealedLiveQuery<ChatMessage>; url: string }
type Store = {
  snapshot: Snapshot
  listeners: Set<() => void>
  abort: AbortController
  subscription?: MaterializedLiveQuerySubscription<ChatMessage>
  renewal?: ReturnType<typeof setTimeout>
}

const stores = new Map<string, Store>()
let client: RealtimeClient | undefined
let clientUrl: string | undefined

function publish(store: Store, snapshot: Snapshot) {
  store.snapshot = snapshot
  for (const listener of store.listeners) listener()
}

async function seal(endpoint: string, fetcher: Fetcher, signal: AbortSignal): Promise<LivePayload> {
  const separator = endpoint.includes('?') ? '&' : '?'
  const response = await fetcher(`${endpoint}${separator}limit=100&transport=realtime`, { signal })
  if (!response.ok) throw new Error(`Realtime chat returned ${response.status}`)
  return response.json() as Promise<LivePayload>
}

async function start(endpoint: string, fetcher: Fetcher, store: Store) {
  try {
    const payload = await seal(endpoint, fetcher, store.abort.signal)
    if (store.abort.signal.aborted) return
    if (!client) {
      clientUrl = payload.url
      client = createRealtimeClient({ url: payload.url })
    }
    if (clientUrl !== payload.url) throw new Error('Realtime endpoint changed during this page session')
    const subscription = client.subscribe(payload.query)
    store.subscription = subscription
    subscription.onChange(({ data, status }) => {
      if (status === 'error') {
        publish(store, { messages: store.snapshot.messages, failed: true })
        return
      }
      if (data) publish(store, { messages: [...data].reverse(), failed: false })
    })
    const scheduleRenewal = (expiresAt: number) => {
      if (store.renewal) clearTimeout(store.renewal)
      store.renewal = setTimeout(() => void renew(), Math.max(1_000, expiresAt - Date.now() - 30_000))
    }
    const renew = async () => {
      try {
        const next = await seal(endpoint, fetcher, store.abort.signal)
        if (!store.abort.signal.aborted) {
          await subscription.renew(next.query)
          scheduleRenewal(next.query.expiresAt)
        }
      } catch {
        if (!store.abort.signal.aborted) publish(store, { messages: store.snapshot.messages, failed: true })
      }
    }
    scheduleRenewal(payload.query.expiresAt)
  } catch {
    if (!store.abort.signal.aborted) publish(store, { failed: true })
  }
}

export function subscribeLiveMessages(endpoint: string, fetcher: Fetcher, listener: () => void) {
  let store = stores.get(endpoint)
  if (!store) {
    store = { snapshot: { failed: false }, listeners: new Set(), abort: new AbortController() }
    stores.set(endpoint, store)
    void start(endpoint, fetcher, store)
  }
  store.listeners.add(listener)
  return () => {
    store!.listeners.delete(listener)
    if (store!.listeners.size) return
    store!.abort.abort()
    if (store!.renewal) clearTimeout(store!.renewal)
    store!.subscription?.unsubscribe()
    stores.delete(endpoint)
  }
}

export function getLiveMessages(endpoint: string): Snapshot {
  return stores.get(endpoint)?.snapshot ?? { failed: false }
}

export const emptyLiveMessages: Snapshot = { failed: false }
