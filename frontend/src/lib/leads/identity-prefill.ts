import type {KnownLeadContext, LeadIdentity} from './contracts'
import type {UrlParams} from './url-params'

/**
 * Resolves the single prefilled identity a lead form should present, regardless
 * of where the values came from: the server-known profile (`context.identity`),
 * assessment-carried answers (`carriedAnswers`), or client URL/stored params
 * (`urlParams`).
 *
 * Per-field precedence matches the submit-merge order used by the lead forms:
 * server context first, then carried answers, then URL params. An explicit URL
 * param email that differs from a source's email disqualifies that whole
 * source — the param asserts a different person, mirroring AssessmentForm's
 * identityChanged wipe.
 */

export const IDENTITY_FIELD_KEYS = [
  'email',
  'name',
  'company',
  'role',
  'website',
] as const

export type IdentityFieldKey = (typeof IDENTITY_FIELD_KEYS)[number]

export type PrefilledIdentity = {
  /** Display/submit values for grouped identity fields. */
  identity: Partial<LeadIdentity>
  /** Identity fields with a resolved value; these render grouped, not as inputs. */
  fields: IdentityFieldKey[]
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function resolvePrefilledIdentity(
  context: KnownLeadContext,
  sources: {
    carriedAnswers?: Record<string, unknown>
    urlParams?: UrlParams
  } = {},
): PrefilledIdentity {
  const urlEmail = stringValue(sources.urlParams?.email)?.toLowerCase()

  // A source only contributes when an explicit URL email does not contradict it.
  const isConsistentWithUrlEmail = (sourceEmail?: string) =>
    !urlEmail || !sourceEmail || sourceEmail.toLowerCase() === urlEmail

  const contextIdentity = isConsistentWithUrlEmail(
    stringValue(context.identity?.email),
  )
    ? context.identity
    : undefined

  const carriedIdentity = isConsistentWithUrlEmail(
    stringValue(sources.carriedAnswers?.email),
  )
    ? sources.carriedAnswers
    : undefined

  const identity: Partial<LeadIdentity> = {}
  const fields: IdentityFieldKey[] = []

  for (const key of IDENTITY_FIELD_KEYS) {
    const value =
      stringValue(contextIdentity?.[key]) ||
      stringValue(carriedIdentity?.[key]) ||
      stringValue(sources.urlParams?.[key])
    if (value) {
      identity[key] = value
      fields.push(key)
    }
  }

  return {identity, fields}
}
