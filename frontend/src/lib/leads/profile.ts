import {cookies} from 'next/headers'
import type {KnownLeadContext} from './contracts'
import {getProfileByToken, latestQualificationAnswers, PROFILE_COOKIE} from './store'
import {emailDomain, isPublicEmailDomain} from './identity'
import {calculateQualification, qualificationTier, recommendedWorkflow} from './scoring'

export async function currentProfileToken(): Promise<string | undefined> {
  return (await cookies()).get(PROFILE_COOKIE)?.value
}

export async function getKnownLeadContext(): Promise<KnownLeadContext> {
  try {
    const profile = await getProfileByToken(await currentProfileToken())
    if (!profile) {
      return {
        known: false,
        knownFields: [],
        knownAnswerFields: [],
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
    }
  } catch (error) {
    console.error('Lead profile context unavailable:', error)
    return {
      known: false,
      knownFields: [],
      knownAnswerFields: [],
    }
  }
}
