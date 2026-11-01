'use client'

import { createBrowserRecorder } from '@portalshq/analytics/browser'
import type { Properties } from '@portalshq/analytics'
import { channelRegistry } from './analytics-contract'

const storageKey = 'portals_channels_analytics_id'
let recorder: ReturnType<typeof createBrowserRecorder> | undefined
function getRecorder() {
  if (process.env.NEXT_PUBLIC_CHANNELS_ANALYTICS_ENABLED !== 'true' || typeof window === 'undefined') return undefined
  return recorder ??= createBrowserRecorder({
    registry: channelRegistry(), endpoint: '/api/analytics',
    storage: {
      get: () => { try { return localStorage.getItem(storageKey) } catch { return null } },
      set: id => { try { localStorage.setItem(storageKey, id) } catch { /* Storage may be unavailable. */ } },
      clear: () => { try { localStorage.removeItem(storageKey) } catch { /* Storage may be unavailable. */ } },
    },
  })
}
export function recordChannelEvent(name: string, properties: Properties = {}) {
  try { getRecorder()?.record(name, properties) } catch { /* Analytics cannot block application actions. */ }
}
