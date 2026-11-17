'use client'

import { createBrowserPrivacyPreference, createBrowserRecorder } from '@portalshq/analytics/browser'
import type { Properties } from '@portalshq/analytics'
import { channelRegistry } from './analytics-contract'

const storageKey = 'portals_channels_analytics_id'
export const analyticsPrivacy = createBrowserPrivacyPreference()
let recorder: ReturnType<typeof createBrowserRecorder> | undefined
function sessionToken(): string | undefined {
  try {
    const value = JSON.parse(localStorage.getItem('channels:viewer') ?? 'null')
    return typeof value?.token === 'string' ? value.token : undefined
  } catch { return undefined }
}
function getRecorder() {
  if (process.env.NEXT_PUBLIC_CHANNELS_ANALYTICS_ENABLED !== 'true' || typeof window === 'undefined') return undefined
  return recorder ??= createBrowserRecorder({
    registry: channelRegistry(), endpoint: '/api/analytics/events', identifyEndpoint: '/api/analytics/identify',
    collectionAllowed: analyticsPrivacy.allowed,
    requestHeaders: () => {
      const headers = new Headers()
      const token = sessionToken()
      let anonymousId: string | null = null
      try { anonymousId = localStorage.getItem(storageKey) } catch { /* Storage may be unavailable. */ }
      if (token) headers.set('Authorization', `Bearer ${token}`)
      if (anonymousId) headers.set('X-Analytics-Anonymous-Id', anonymousId)
      return headers
    },
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
export function bindChannelAnalyticsIdentity() { return getRecorder()?.bindIdentity().catch(() => undefined) }
export function resetChannelAnalyticsIdentity() { return getRecorder()?.resetIdentity().catch(() => undefined) }
export function flushChannelAnalytics() { return getRecorder()?.flush().catch(() => undefined) }
export function channelAnalyticsPreference(method: 'GET' | 'PUT', suppressed?: boolean) {
  const headers = new Headers()
  const token = sessionToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (method === 'PUT') headers.set('Content-Type', 'application/json')
  return fetch('/api/analytics/preferences', {
    method,
    headers,
    ...(method === 'PUT' ? {body: JSON.stringify({suppressed})} : {}),
  })
}
