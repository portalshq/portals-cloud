import { z } from 'zod'
import { emailDomain, allowsPersonalEmailForDevelopment, requiresCompanyEmailDomain } from './identity'

/**
 * URL parameter parser and validator for form field auto-population.
 * Handles validation, normalization, and fallback defaults for progressive qualification forms.
 */

// Enum options from contracts.ts
const HOW_DID_YOU_HEAR_OPTIONS = [
  'google-search',
  'linkedin', 
  'email',
  'someone-company',
  'friend-colleague',
  'article-newsletter-podcast',
  'partner-company',
  'social-media',
] as const

const WHAT_BROUGHT_YOU_OPTIONS = [
  'workflow-problem',
  'assess-scaling',
  'evaluating-tools',
  'other',
] as const

const CONTACT_INTEREST_OPTIONS = [
  'workflow-review',
  'security-review',
  'integration',
  'commercial',
  'other',
] as const

const TEAM_TYPE_OPTIONS = [
  'agency',
  'creative-studio',
  'production-company',
  'in-house-creative',
  'brand-marketing',
  'film-animation',
  'game-entertainment',
  'independent-creator',
  'other',
] as const

const TEAM_SIZE_OPTIONS = [
  '1',
  '2-4',
  '5-9',
  '10-24',
  '25-plus',
] as const

const RESOURCE_INTEREST_OPTIONS = [
  'approved-version-retrieval',
  'asset-reproduction',
  'five-more-like-this',
  'character-continuity',
  'production-handoff',
  'campaign-variant-control',
  'data-protection',
  'access-controls',
  'resilience',
  'data-lifecycle',
  'vendors',
  'assurance',
  'other',
] as const

// Validation schemas
const urlParamSchema = z.object({
  how_did_you_hear: z.enum(HOW_DID_YOU_HEAR_OPTIONS).optional(),
  what_brought_you: z.enum(WHAT_BROUGHT_YOU_OPTIONS).optional(),
  what_brought_you_other: z.string().max(500).optional(),
  email: z.string().email().max(254).optional(),
  name: z.string().max(160).optional(),
  company: z.string().max(160).optional(),
  role: z.string().max(120).optional(),
  website: z.string().max(300).optional(),
  interest: z.string().max(160).optional(),
  team_type: z.enum(TEAM_TYPE_OPTIONS).optional(),
  team_size: z.enum(TEAM_SIZE_OPTIONS).optional(),
  tools_used: z.string().max(500).optional(),
})

export type UrlParams = z.infer<typeof urlParamSchema>

/**
 * Normalizes text values for CRM consistency
 */
function normalizeTextValue(value: string, fieldType: 'enum' | 'email' | 'role' | 'company' | 'name' | 'text'): string {
  const trimmed = value.trim()
  
  switch (fieldType) {
    case 'enum':
      return trimmed.toLowerCase()
    case 'email':
      return trimmed.toLowerCase()
    case 'role':
      return trimmed.toLowerCase()
    case 'company':
      return trimmed.toLowerCase() // Store lowercase, title-case for display
    case 'name':
      return toTitleCase(trimmed) // Title case for names
    case 'text':
      return trimmed // Preserve case for free text
    default:
      return trimmed
  }
}

/**
 * Converts string to title case for display
 */
function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Validates and normalizes a website URL
 */
function normalizeWebsite(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  
  // Add protocol if missing
  if (!trimmed.match(/^https?:\/\//i)) {
    return `https://${trimmed}`
  }
  
  return trimmed
}

/**
 * Validates email domain against company email requirements
 * Respects development mode for personal email testing
 */
function validateEmailDomain(email: string): { valid: boolean; error?: string } {
  try {
    const domain = emailDomain(email)
    
    // In development mode with opt-in, allow specific personal domains
    if (allowsPersonalEmailForDevelopment(domain)) {
      return { valid: true }
    }
    
    // Normal validation
    if (requiresCompanyEmailDomain(domain)) {
      return { 
        valid: false, 
        error: 'a company email domain is required (personal email domains like gmail.com are not accepted)' 
      }
    }
    
    return { valid: true }
  } catch {
    return { valid: false, error: 'invalid email format' }
  }
}

/**
 * Parses and validates URL parameters from current location
 */
export function parseUrlParams(): UrlParams {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const params = new URLSearchParams(window.location.search)
    const rawParams: Record<string, string> = {}
    
    // Extract all potential parameters
    for (const [key, value] of params.entries()) {
      rawParams[key] = value
    }
    
    // Validate against schema
    const validated = urlParamSchema.safeParse(rawParams)
    
    if (!validated.success) {
      // Log validation errors in development only
      if (process.env.NODE_ENV === 'development') {
        console.warn('[URL Params] Validation errors:', validated.error.errors)
      }
      
      // Return partial valid params
      const partialParams: Partial<UrlParams> = {}
      for (const [key, value] of Object.entries(rawParams)) {
        try {
          // Try to validate each field individually
          const fieldSchema = urlParamSchema.shape[key as keyof UrlParams]
          if (fieldSchema) {
            const result = fieldSchema.safeParse(value)
            if (result.success) {
              partialParams[key as keyof UrlParams] = result.data
            }
          }
        } catch {
          // Skip invalid fields
        }
      }
      return partialParams as UrlParams
    }
    
    return validated.data
  } catch (error) {
    console.error('[URL Params] Error parsing URL parameters:', error)
    return {}
  }
}

/**
 * Normalizes URL parameters with appropriate formatting and validation
 */
export function normalizeUrlParams(params: UrlParams): UrlParams {
  const normalized: UrlParams = {}
  
  // Normalize enum values (lowercase)
  if (params.how_did_you_hear) {
    normalized.how_did_you_hear = normalizeTextValue(params.how_did_you_hear, 'enum') as any
  }
  if (params.what_brought_you) {
    normalized.what_brought_you = normalizeTextValue(params.what_brought_you, 'enum') as any
  }
  if (params.interest) {
    normalized.interest = normalizeTextValue(params.interest, 'enum') as any
  }
  if (params.team_type) {
    normalized.team_type = normalizeTextValue(params.team_type, 'enum') as any
  }
  if (params.team_size) {
    normalized.team_size = normalizeTextValue(params.team_size, 'enum') as any
  }
  
  // Normalize text fields
  if (params.what_brought_you_other) {
    normalized.what_brought_you_other = normalizeTextValue(params.what_brought_you_other, 'text')
  }
  if (params.tools_used) {
    normalized.tools_used = normalizeTextValue(params.tools_used, 'text')
  }
  
  // Normalize identity fields
  if (params.email) {
    normalized.email = normalizeTextValue(params.email, 'email')
  }
  if (params.name) {
    normalized.name = normalizeTextValue(params.name, 'name')
  }
  if (params.company) {
    normalized.company = normalizeTextValue(params.company, 'company')
  }
  if (params.role) {
    normalized.role = normalizeTextValue(params.role, 'role')
  }
  if (params.website) {
    normalized.website = normalizeWebsite(params.website)
  }
  
  return normalized
}

/**
 * Applies fallback defaults for missing or invalid parameters
 */
export function applyFallbackDefaults(params: UrlParams): UrlParams {
  const withDefaults = { ...params }
  
  // Apply fallback for how_did_you_hear
  if (!withDefaults.how_did_you_hear) {
    withDefaults.how_did_you_hear = 'google-search'
  }
  
  // Other fields intentionally fall back to empty/undefined
  // to ensure user provides required information
  
  return withDefaults
}

/**
 * Validates email domain from URL parameters
 * Returns validation result without throwing
 */
export function validateUrlParamEmail(email: string): { valid: boolean; error?: string } {
  if (!email) return { valid: true } // Empty is valid (user will provide)
  
  const emailValidation = z.string().email().max(254).safeParse(email)
  if (!emailValidation.success) {
    return { valid: false, error: 'invalid email format' }
  }
  
  return validateEmailDomain(email)
}

/**
 * Determines if a field should be hidden based on pre-filled value
 * Critical fields (email, company, role) are never hidden
 */
export function shouldHideField(fieldName: string, value: string | null | undefined): boolean {
  if (!value) return false // Show if empty
  
  const criticalFields = ['email', 'company', 'role']
  if (criticalFields.includes(fieldName)) return false
  
  // Hide non-critical fields if pre-filled
  return true
}

/**
 * Gets display value for a field (title-cased for company/name, lowercase for others)
 */
export function getDisplayValue(value: string, fieldType: 'company' | 'name' | 'role' | 'text'): string {
  switch (fieldType) {
    case 'company':
    case 'name':
      return toTitleCase(value)
    case 'role':
      return value.toLowerCase()
    case 'text':
      return value
    default:
      return value
  }
}