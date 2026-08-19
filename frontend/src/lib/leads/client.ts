'use client'

import type {LeadRequest, LeadResponse} from './contracts'
import {
  anonymousAnalyticsId,
  identifyAnalyticsPerson,
  trackEvent,
} from './analytics-client'
import {emailDomain, isPublicEmailDomain, normalizeDomain} from './identity'
import {clearAllFormDrafts} from './form-draft'
import {clearPilotConfirmation} from './pilot-confirmation'

export function newSubmissionId(prefix: string): string {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}:${globalThis.crypto.randomUUID()}`
  }
  const bytes = new Uint8Array(16)
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${prefix}:${Date.now().toString(36)}:${value}`
}

export function publicEmailNeedsWebsite(email: string): boolean {
  return Boolean(email && isPublicEmailDomain(emailDomain(email)))
}

export async function submitLead(request: LeadRequest): Promise<LeadResponse> {
  const response = await fetch('/api/leads', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({...request, anonAnalyticsId: anonymousAnalyticsId()}),
  })
  const result = (await response.json()) as LeadResponse & {error?: string}
  if (!response.ok || !result.ok) {
    throw new Error(result.error || 'we could not submit the request')
  }
  if (result.analyticsPersonId) {
    let domain = ''
    const identity = request.identity
    if (identity?.email && !publicEmailNeedsWebsite(identity.email)) {
      domain = emailDomain(identity.email)
    } else if (identity?.website) {
      try {
        domain = normalizeDomain(identity.website)
      } catch {
        domain = ''
      }
    }
    identifyAnalyticsPerson(result.analyticsPersonId, domain)
  }
  return result
}

export function clearLeadProfileStorage() {
  if (typeof window === 'undefined') return
  clearAllFormDrafts()
  clearPilotConfirmation()
  try {
    window.localStorage.removeItem('portals_analytics_person_id')
    window.localStorage.removeItem('portals_company_domain')
    window.localStorage.removeItem('portals_qualification_behavior')
    window.localStorage.removeItem('portals_analytics_alias_sent')
    window.localStorage.removeItem('portals_first_touch')
  } catch {
    // Storage cleanup must never throw
  }
}

export async function resetKnownProfile(): Promise<void> {
  try {
    await fetch('/api/leads', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({action: 'reset_profile'}),
    })
  } catch (error) {
    console.error('Failed to reset profile on server:', error)
  }
  clearLeadProfileStorage()
  if (typeof document !== 'undefined') {
    document.querySelectorAll('form').forEach((form) => {
      try {
        form.reset()
      } catch {
        // ignore
      }
    })
  }
  if (typeof window !== 'undefined') {
    window.location.replace(window.location.href)
  }
}

