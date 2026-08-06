import {cookies} from 'next/headers'
import type {KnownLeadContext} from './contracts'
import {signValue, verifySignature} from './crypto'
import {getProfileByToken, latestQualificationAnswers, PROFILE_COOKIE} from './store'
import {emailDomain, isPublicEmailDomain} from './identity'
import {calculateQualification, qualificationTier, recommendedWorkflow} from './scoring'

type TallyContextPayload = {
  profileId?: string
  issuedAt: number
  expiresAt: number
  formVersion: string
}

function optionalTallyContext(profileId?: string): string | undefined {
  try {
    return createTallyContext(profileId)
  } catch (error) {
    console.error('Tally profile context unavailable:', error)
    return undefined
  }
}

export async function currentProfileToken(): Promise<string | undefined> {
  return (await cookies()).get(PROFILE_COOKIE)?.value
}

export async function getKnownLeadContext(
  includeTallyContext = false,
): Promise<KnownLeadContext> {
  try {
    const profile = await getProfileByToken(await currentProfileToken())
    if (!profile) {
      return {
        known: false,
        knownFields: [],
        knownAnswerFields: [],
        ...(includeTallyContext
          ? {tallyContext: optionalTallyContext()}
          : {}),
      }
    }
    const knownFields: KnownLeadContext['knownFields'] = []
    if (profile.identity.email) knownFields.push('email')
    if (profile.identity.name) knownFields.push('name')
    if (profile.identity.company) knownFields.push('company')
    if (profile.identity.role) knownFields.push('role')
    if (profile.identity.website) knownFields.push('website')
    const fallbackAnswers = profile.qualification
      ? profile.qualification.answers
      : await latestQualificationAnswers(profile.id)
    const hasQualification = Object.keys(fallbackAnswers).length > 0
    const fallbackScores = hasQualification
      ? calculateQualification(fallbackAnswers)
      : undefined
    const qualification = profile.qualification
    const knownAnswerFields = Object.entries(fallbackAnswers)
      .filter(([, value]) =>
        typeof value === 'string' ? value.trim().length > 0 : value != null,
      )
      .map(([key]) => key)
    const answerValues = Object.fromEntries(
      Object.entries(fallbackAnswers).filter(([, value]) =>
        typeof value === 'string' ? value.trim().length > 0 : value != null,
      ),
    ) as Record<string, string>
    const recreationFrequency = fallbackAnswers.recreationFrequency
    return {
      known: true,
      knownFields,
      knownAnswerFields,
      answerValues,
      requiresWebsite:
        Boolean(profile.identity.email) &&
        !profile.identity.website &&
        isPublicEmailDomain(emailDomain(profile.identity.email || '')),
      scores: qualification?.scores || fallbackScores,
      qualificationTier:
        qualification?.tier || (fallbackScores ? qualificationTier(fallbackScores) : undefined),
      recommendedWorkflow:
        qualification?.recommendedWorkflow ||
        (hasQualification ? recommendedWorkflow(fallbackAnswers) : undefined),
      incidentFollowUpEligible:
        typeof recreationFrequency === 'string'
          ? recreationFrequency !== 'never'
          : undefined,
      ...(includeTallyContext
        ? {tallyContext: optionalTallyContext(profile.id)}
        : {}),
    }
  } catch (error) {
    console.error('Lead profile context unavailable:', error)
    return {
      known: false,
      knownFields: [],
      knownAnswerFields: [],
      ...(includeTallyContext
        ? {tallyContext: optionalTallyContext()}
        : {}),
    }
  }
}

export function createTallyContext(profileId?: string): string {
  const now = Math.floor(Date.now() / 1000)
  const payload: TallyContextPayload = {
    profileId,
    issuedAt: now,
    expiresAt: now + 60 * 60 * 24,
    formVersion: 'assessment.v1',
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${signValue(encoded, 'TALLY_CONTEXT_SECRET')}`
}

export function verifyTallyContext(value: string): TallyContextPayload | null {
  const [encoded, signature] = value.split('.')
  if (!encoded || !signature) return null
  if (!verifySignature(encoded, signature, 'TALLY_CONTEXT_SECRET')) return null
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as TallyContextPayload
    if (payload.expiresAt < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}
