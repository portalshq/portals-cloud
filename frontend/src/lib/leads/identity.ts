import type { LeadIdentity } from './contracts'

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

const developmentPersonalEmailDomains = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
])

const pilotRoleEmailLabels: Record<string, string> = {
  productionOwnerEmail: 'production owner',
  economicBuyerEmail: 'economic buyer',
  technicalEvaluatorEmail: 'technical evaluator',
  approverEmail: 'approver',
  signerEmail: 'signer',
}

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

/**
 * Local pilot testing can explicitly opt into a small set of real personal
 * inboxes. The API relies on a private flag; browser validation mirrors it
 * with a public flag. Production and preview builds never allow this path.
 */
export function allowsPersonalEmailForDevelopment(domain: string): boolean {
  if (process.env.NODE_ENV !== 'development') return false
  if (!developmentPersonalEmailDomains.has(domain.toLowerCase())) return false
  return typeof window === 'undefined'
    ? process.env.LEADS_ALLOW_PERSONAL_EMAILS_FOR_DEV === 'true'
    : process.env.NEXT_PUBLIC_ALLOW_PERSONAL_EMAILS_FOR_DEV === 'true'
}

export function requiresCompanyEmailDomain(domain: string): boolean {
  return isPublicEmailDomain(domain) && !allowsPersonalEmailForDevelopment(domain)
}

/** Enforces the same policy for every role address persisted on a pilot. */
export function validatePilotRoleEmailDomains(answers: Record<string, unknown>): string | null {
  for (const [field, label] of Object.entries(pilotRoleEmailLabels)) {
    const value = String(answers[field] || '').trim()
    if (value && requiresCompanyEmailDomain(emailDomain(value))) {
      return `a company email domain is required for the ${label}`
    }
  }
  return null
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
  if (requiresCompanyEmailDomain(domain)) {
    return 'a company email domain is required (personal email domains like gmail.com are not accepted)'
  }

  try {
    const resolved = companyDomain(identity)
    if (!resolved.includes('.')) return 'please enter a valid company website'
  } catch {
    return 'please enter a valid company website'
  }

  return null
}
