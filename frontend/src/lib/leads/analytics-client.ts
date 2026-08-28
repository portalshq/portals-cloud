'use client'

import type {LeadAttribution} from './contracts'
import UAParser from 'ua-parser-js'

const CONSENT_KEY = 'portals_analytics_consent'
const TOUCH_KEY = 'portals_first_touch'
const PERSON_KEY = 'portals_analytics_person_id'
const DOMAIN_KEY = 'portals_company_domain'
const ANON_KEY = 'portals_analytics_anon_id'
const ALIAS_KEY = 'portals_analytics_alias_sent'
const QUALIFICATION_BEHAVIOR_KEY = 'portals_qualification_behavior'
const OS_CACHE_KEY = 'portals_analytics_os'
const FORM_PARAMS_KEY = 'portals_form_params'
const BEHAVIOR_TTL_MS = 90 * 24 * 60 * 60 * 1000
const FORM_PARAMS_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export type QualificationBehavior = {
  pricingOrPilotViewed: boolean
  securityDiligence: boolean
}

export function detectOS(): string {
  if (typeof window === 'undefined') return ''
  try {
    const cached = window.localStorage.getItem(OS_CACHE_KEY)
    if (cached) return cached
    const parser = new UAParser()
    const os = parser.getOS()
    if (os.name) {
      const version = os.version ? ` ${os.version}` : ''
      const result = `${os.name}${version}`.slice(0, 80)
      try {
        window.localStorage.setItem(OS_CACHE_KEY, result)
      } catch {
        // Storage might be disabled or full; continue without caching
      }
      return result
    }
  } catch (error) {
    console.error('Error detecting OS:', error)
  }
  return ''
}

export type AnalyticsConsent = 'accepted' | 'rejected' | null

export function analyticsConsent(): AnalyticsConsent {
  if (typeof window === 'undefined') return null
  const value = window.localStorage.getItem(CONSENT_KEY)
  return value === 'accepted' || value === 'rejected' ? value : null
}

export function setAnalyticsConsent(value: Exclude<AnalyticsConsent, null>) {
  window.localStorage.setItem(CONSENT_KEY, value)
  window.dispatchEvent(new CustomEvent('portals:analytics-consent', {detail: value}))
}

function queryAttribution(): LeadAttribution {
  const params = new URLSearchParams(window.location.search)
  return {
    sourcePage: `${window.location.pathname}${window.location.search}`.slice(0, 500),
    ctaLabel: '',
    intent: '',
    useCase: '',
    referrer: document.referrer.slice(0, 500),
    utmSource: (params.get('utm_source') || '').slice(0, 160),
    utmMedium: (params.get('utm_medium') || '').slice(0, 160),
    utmCampaign: (params.get('utm_campaign') || '').slice(0, 160),
    utmContent: (params.get('utm_content') || '').slice(0, 160),
    utmTerm: (params.get('utm_term') || '').slice(0, 160),
    clientIp: '',
    os: detectOS(),
  }
}

export function captureFirstTouch() {
  if (typeof window === 'undefined' || window.localStorage.getItem(TOUCH_KEY)) return
  window.localStorage.setItem(TOUCH_KEY, JSON.stringify(queryAttribution()))
  // Also capture URL parameters for form pre-fill
  captureUrlParams()
}

export function captureQualificationBehavior(pathname: string) {
  if (typeof window === 'undefined') return
  const current = qualificationBehavior()
  const behavior: QualificationBehavior & {expiresAt: number} = {
    pricingOrPilotViewed:
      current.pricingOrPilotViewed || pathname === '/paid-pilot',
    securityDiligence:
      current.securityDiligence || pathname === '/security-and-architecture',
    expiresAt: Date.now() + BEHAVIOR_TTL_MS,
  }
  window.localStorage.setItem(
    QUALIFICATION_BEHAVIOR_KEY,
    JSON.stringify(behavior),
  )
}

export function qualificationBehavior(): QualificationBehavior {
  const empty = {pricingOrPilotViewed: false, securityDiligence: false}
  if (typeof window === 'undefined') return empty
  try {
    const value = JSON.parse(
      window.localStorage.getItem(QUALIFICATION_BEHAVIOR_KEY) || '{}',
    ) as Partial<QualificationBehavior> & {expiresAt?: number}
    if (!value.expiresAt || value.expiresAt < Date.now()) {
      window.localStorage.removeItem(QUALIFICATION_BEHAVIOR_KEY)
      return empty
    }
    return {
      pricingOrPilotViewed: value.pricingOrPilotViewed === true,
      securityDiligence: value.securityDiligence === true,
    }
  } catch {
    window.localStorage.removeItem(QUALIFICATION_BEHAVIOR_KEY)
    return empty
  }
}

export function buildAttribution(
  values: Partial<LeadAttribution> = {},
): LeadAttribution {
  const current = queryAttribution()
  let first: Partial<LeadAttribution> = {}
  try {
    first = JSON.parse(window.localStorage.getItem(TOUCH_KEY) || '{}')
  } catch {
    first = {}
  }
  return {
    ...current,
    utmSource: current.utmSource || first.utmSource || '',
    utmMedium: current.utmMedium || first.utmMedium || '',
    utmCampaign: current.utmCampaign || first.utmCampaign || '',
    utmContent: current.utmContent || first.utmContent || '',
    utmTerm: current.utmTerm || first.utmTerm || '',
    ...values,
  }
}

export function identifyAnalyticsPerson(personId: string, companyDomain = '') {
  const previous = window.localStorage.getItem(PERSON_KEY)
  window.localStorage.setItem(PERSON_KEY, personId)
  if (companyDomain) window.localStorage.setItem(DOMAIN_KEY, companyDomain)
  if (previous !== personId) ensureAnalyticsAlias(personId)
}

export function anonymousAnalyticsId(): string {
  if (typeof window === 'undefined') return ''
  const existing = window.localStorage.getItem(ANON_KEY)
  if (existing) return existing
  let value: string
  if (globalThis.crypto?.randomUUID) {
    value = globalThis.crypto.randomUUID()
  } else {
    value = `anon:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`
  }
  window.localStorage.setItem(ANON_KEY, value)
  return value
}

function ensureAnalyticsAlias(personId: string): void {
  if (window.localStorage.getItem(ALIAS_KEY) === personId) return
  window.localStorage.setItem(ALIAS_KEY, personId)
  if (analyticsConsent() !== 'accepted') return
  const anonId = anonymousAnalyticsId()
  void postToMixpanel('$create_alias', {
    distinct_id: anonId,
    $device_id: anonId,
    alias: personId,
  })
}

async function postToMixpanel(
  event: string,
  properties: Record<string, unknown>,
): Promise<void> {
  if (!process.env.NEXT_PUBLIC_MIXPANEL_TOKEN) return
  try {
    await fetch('/api/analytics/track', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({event, properties}),
      keepalive: true,
    })
  } catch {
    // Analytics must never block navigation or form delivery.
  }
}

export async function trackEvent(
  event: string,
  properties: Record<string, unknown> = {},
): Promise<void> {
  if (typeof window === 'undefined' || analyticsConsent() !== 'accepted') return
  const personId = window.localStorage.getItem(PERSON_KEY)
  const domain = window.localStorage.getItem(DOMAIN_KEY)
  const anonId = anonymousAnalyticsId()
  if (personId) ensureAnalyticsAlias(personId)
  await postToMixpanel(event, {
    distinct_id: personId || anonId,
    person_id: personId || undefined,
    company_domain: domain || undefined,
    source_page: window.location.pathname,
    $device_id: anonId,
    $os: detectOS(),
    ...properties,
  })
}

export async function trackQualificationAnswers(
  properties: {
    whatBroughtYouHere?: string
    whatBroughtYouHereOther?: string
    howDidYouHearAboutPortals?: string
  },
): Promise<void> {
  await trackEvent('qualification_answers_submitted', properties)
}

export async function trackDealRoles(
  properties: {
    initialContact?: {name: string; email: string}
    projectManager?: {name: string; email: string}
    buyer?: {name: string; email: string}
    evaluator?: {name: string; email: string}
    decisionMaker?: {name: string; email: string}
    contractSigner?: {name: string; email: string}
  },
): Promise<void> {
  await trackEvent('deal_roles_identified', properties)
}

/**
 * Stores form parameters in localStorage for cross-page persistence
 * Parameters expire after 30 days
 */
export function storeFormParams(params: Record<string, string>): void {
  if (typeof window === 'undefined') return
  
  try {
    const data = {
      params,
      expiresAt: Date.now() + FORM_PARAMS_TTL_MS
    }
    window.localStorage.setItem(FORM_PARAMS_KEY, JSON.stringify(data))
  } catch (error) {
    // Storage might be disabled or full; continue without storage
    console.warn('[Form Params] Failed to store form parameters:', error)
  }
}

/**
 * Retrieves stored form parameters from localStorage
 * Returns empty object if no valid stored parameters exist
 */
export function retrieveFormParams(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  
  try {
    const stored = window.localStorage.getItem(FORM_PARAMS_KEY)
    if (!stored) return {}
    
    const data = JSON.parse(stored) as {params: Record<string, string>, expiresAt: number}
    
    // Check expiration
    if (!data.expiresAt || data.expiresAt < Date.now()) {
      window.localStorage.removeItem(FORM_PARAMS_KEY)
      return {}
    }
    
    return data.params
  } catch (error) {
    console.warn('[Form Params] Failed to retrieve form parameters:', error)
    return {}
  }
}

/**
 * Clears stored form parameters from localStorage
 */
export function clearFormParams(): void {
  if (typeof window === 'undefined') return
  
  try {
    window.localStorage.removeItem(FORM_PARAMS_KEY)
  } catch (error) {
    console.warn('[Form Params] Failed to clear form parameters:', error)
  }
}

/**
 * Stores URL parameters when user lands on any page
 * Called automatically to enable cross-page parameter persistence
 */
export function captureUrlParams(): void {
  if (typeof window === 'undefined') return
  
  try {
    const params = new URLSearchParams(window.location.search)
    const paramObj: Record<string, string> = {}
    
    // Store all URL parameters
    for (const [key, value] of params.entries()) {
      paramObj[key] = value
    }
    
    // Only store if there are parameters
    if (Object.keys(paramObj).length > 0) {
      storeFormParams(paramObj)
    }
  } catch (error) {
    console.warn('[Form Params] Failed to capture URL parameters:', error)
  }
}
