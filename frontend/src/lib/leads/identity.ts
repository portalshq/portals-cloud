import type {LeadIdentity} from './contracts'

const publicEmailDomains = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'icloud.com',
  'me.com',
  'proton.me',
  'protonmail.com',
  'mailinator.com',
  'guerrillamail.com',
  'sharklasers.com',
  'yopmail.com',
  '10minutemail.com',
  'tempmail.com',
  'discard.email',
  'getnada.com',
])

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function emailDomain(value: string): string {
  return normalizeEmail(value).split('@').pop() || ''
}

export function normalizeDomain(value: string): string {
  const url = new URL(
    value.match(/^https?:\/\//i) ? value : `https://${value}`,
  )
  return url.hostname.toLowerCase().replace(/^www\./, '')
}

export function isPublicEmailDomain(domain: string): boolean {
  const additional = new Set(
    (process.env.NEXT_PUBLIC_ADDITIONAL_PUBLIC_EMAIL_DOMAINS || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  )
  return publicEmailDomains.has(domain.toLowerCase()) || additional.has(domain.toLowerCase())
}

export function companyDomain(identity: LeadIdentity): string {
  const domain = identity.email ? emailDomain(identity.email) : ''
  if (domain && !isPublicEmailDomain(domain)) return domain
  if (identity.website) return normalizeDomain(identity.website)
  return ''
}

export function validateIdentityForCapture(identity: LeadIdentity): string | null {
  if (!identity.email || !identity.company || !identity.role) {
    return 'work email, company, and role are required'
  }

  const domain = emailDomain(identity.email)
  if (isPublicEmailDomain(domain) && !identity.website) {
    return 'company website is required when using a public email address'
  }

  try {
    const resolved = companyDomain(identity)
    if (!resolved.includes('.')) return 'please enter a valid company website'
  } catch {
    return 'please enter a valid company website'
  }

  return null
}
