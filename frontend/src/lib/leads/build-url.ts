import { z } from 'zod'
import type { UrlParams } from './url-params'

/**
 * URL builder utility for marketing teams to generate valid campaign URLs
 * Handles parameter validation, encoding, and normalization
 */

// Validation schema for URL building (same as url-params but with different validation approach)
const buildUrlParamSchema = z.object({
  how_did_you_hear: z.string().optional(),
  what_brought_you: z.string().optional(),
  what_brought_you_other: z.string().max(500).optional(),
  email: z.string().email().max(254).optional(),
  name: z.string().max(160).optional(),
  company: z.string().max(160).optional(),
  role: z.string().max(120).optional(),
  website: z.string().max(300).optional(),
  interest: z.string().max(160).optional(),
  team_type: z.string().optional(),
  team_size: z.string().optional(),
  tools_used: z.string().max(500).optional(),
  // UTM parameters
  utm_source: z.string().max(160).optional(),
  utm_medium: z.string().max(160).optional(),
  utm_campaign: z.string().max(160).optional(),
  utm_content: z.string().max(160).optional(),
  utm_term: z.string().max(160).optional(),
})

export type BuildUrlParams = z.infer<typeof buildUrlParamSchema>

/**
 * Normalizes and validates parameters for URL building
 */
function normalizeBuildParams(params: BuildUrlParams): Record<string, string> {
  const normalized: Record<string, string> = {}
  
  // Convert all string values to lowercase for consistency (except free text)
  const lowercaseFields = [
    'how_did_you_hear',
    'what_brought_you', 
    'interest',
    'team_type',
    'team_size',
    'email',
    'role',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
  ]
  
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    
    // Normalize field names from camelCase to snake_case for URL consistency
    const urlKey = key.replace(/([A-Z])/g, '_$1').toLowerCase()
    
    // Apply appropriate normalization
    if (lowercaseFields.includes(key)) {
      normalized[urlKey] = value.toLowerCase().trim()
    } else if (key === 'website') {
      // Ensure website has protocol
      const website = value.trim()
      normalized[urlKey] = website.match(/^https?:\/\//i) ? website : `https://${website}`
    } else {
      // Free text fields - preserve case but trim
      normalized[urlKey] = value.trim()
    }
  }
  
  return normalized
}

/**
 * Validates URL parameters before building
 */
function validateBuildParams(params: BuildUrlParams): { valid: boolean; errors: string[] } {
  const result = buildUrlParamSchema.safeParse(params)
  
  if (!result.success) {
    const errors = result.error?.errors?.map(err => 
      `${err.path.join('.')}: ${err.message}`
    ) || ['Validation failed']
    return { valid: false, errors }
  }
  
  return { valid: true, errors: [] }
}

/**
 * Builds a complete URL with encoded query parameters
 */
export function buildFormUrl(baseUrl: string, params: BuildUrlParams): string {
  // Validate parameters
  const validation = validateBuildParams(params)
  if (!validation.valid) {
    console.warn('[Build URL] Validation errors:', validation.errors)
    // Continue with valid parameters only - filter out invalid fields
    const result = buildUrlParamSchema.safeParse(params)
    if (result.success) {
      // Use validated (and filtered) params
      const normalizedParams = normalizeBuildParams(result.data)
      const queryString = new URLSearchParams(normalizedParams).toString()
      return queryString ? `${baseUrl}?${queryString}` : baseUrl
    }
  }
  
  // Normalize parameters
  const normalizedParams = normalizeBuildParams(params)
  
  // Build query string
  const queryString = new URLSearchParams(normalizedParams).toString()
  
  // Return URL with query string
  return queryString ? `${baseUrl}?${queryString}` : baseUrl
}

/**
 * Builds a URL specifically for the assessment form
 */
export function buildAssessmentUrl(params: BuildUrlParams): string {
  return buildFormUrl('https://portals.ai/workflow/assessment', params)
}

/**
 * Builds a URL specifically for the contact form
 */
export function buildContactUrl(params: BuildUrlParams): string {
  return buildFormUrl('https://portals.ai/contact', params)
}

/**
 * Builds a URL specifically for the pilot scope form
 */
export function buildPilotUrl(params: BuildUrlParams): string {
  return buildFormUrl('https://portals.ai/paid-pilot', params)
}

/**
 * Builds a URL for resource download forms
 */
export function buildResourceUrl(baseUrl: string, params: BuildUrlParams): string {
  return buildFormUrl(baseUrl, params)
}

/**
 * Generates example URLs for common marketing scenarios
 */
export function generateExampleUrls(): Record<string, string> {
  return {
    'Email Campaign - Workflow Problem': buildAssessmentUrl({
      how_did_you_hear: 'email',
      what_brought_you: 'workflow-problem',
      utm_source: 'newsletter',
      utm_medium: 'email',
      utm_campaign: 'workflow-awareness',
    }),
    
    'LinkedIn Post - Tool Evaluation': buildAssessmentUrl({
      how_did_you_hear: 'linkedin',
      what_brought_you: 'evaluating-tools',
      utm_source: 'linkedin',
      utm_medium: 'social',
      utm_campaign: 'tool-evaluation',
    }),
    
    'Partner Program - Scaling': buildAssessmentUrl({
      how_did_you_hear: 'partner-company',
      what_brought_you: 'assess-scaling',
      company: 'PartnerCorp',
      role: 'technical lead',
      utm_source: 'partner',
      utm_medium: 'referral',
      utm_campaign: 'partner-program',
    }),
    
    'Contact Form - Security Review': buildContactUrl({
      how_did_you_hear: 'linkedin',
      interest: 'security-review',
      utm_source: 'linkedin',
      utm_medium: 'social',
      utm_campaign: 'security-content',
    }),
    
    'Production Guide - Asset Reproduction': buildResourceUrl(
      'https://portals.ai/workflow/ai-production-workflow-risks#download',
      {
        how_did_you_hear: 'google-search',
        interest: 'asset-reproduction',
        utm_source: 'google',
        utm_medium: 'organic',
        utm_campaign: 'production-guide',
      }
    ),
    
    'Full Assessment Pre-fill': buildAssessmentUrl({
      email: 'sarah@agency.com',
      name: 'Sarah Johnson',
      company: 'Creative Agency X',
      role: 'head of production',
      team_type: 'agency',
      team_size: '10-24',
      tools_used: 'Adobe Firefly, Runway, Midjourney',
      how_did_you_hear: 'linkedin',
      what_brought_you: 'workflow-problem',
      utm_source: 'linkedin',
      utm_medium: 'social',
      utm_campaign: 'agency-targeting',
    }),
  }
}

/**
 * Creates a URL parameter string from an object (for manual URL construction)
 */
export function createQueryString(params: Record<string, string | number | boolean>): string {
  const queryParams: Record<string, string> = {}
  
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    
    // Convert to string and normalize key
    const urlKey = key.replace(/([A-Z])/g, '_$1').toLowerCase()
    queryParams[urlKey] = String(value)
  }
  
  return new URLSearchParams(queryParams).toString()
}

/**
 * Parses and validates URL parameters (for testing/debugging)
 */
export function parseUrlString(urlString: string): { baseUrl: string; params: Record<string, string> } {
  try {
    const url = new URL(urlString)
    const params: Record<string, string> = {}
    
    for (const [key, value] of url.searchParams.entries()) {
      params[key] = value
    }
    
    // Remove query string from base URL
    const baseUrl = url.origin + url.pathname
    
    return { baseUrl, params }
  } catch (error) {
    console.error('[Build URL] Failed to parse URL string:', error)
    return { baseUrl: urlString, params: {} }
  }
}