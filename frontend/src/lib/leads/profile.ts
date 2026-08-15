import {cookies} from 'next/headers'
import type {KnownLeadContext} from './contracts'
import {getProfileById, getProfileByToken, latestQualificationAnswers, PROFILE_COOKIE} from './store'
import {APP_SESSION_COOKIE, currentApplicationUser} from './application-auth'
import {emailDomain, isPublicEmailDomain} from './identity'
import {
  calculateQualification,
  missingReadinessFields,
  qualificationOutcome,
  qualificationReasonCodes,
  qualificationTier,
  recommendedWorkflow,
} from './scoring'

export async function currentProfileToken(): Promise<string | undefined> {
  return (await cookies()).get(PROFILE_COOKIE)?.value
}

export async function getKnownLeadContext(): Promise<KnownLeadContext> {
  try {
    const cookieStore = await cookies()
    const profile = await getProfileByToken(cookieStore.get(PROFILE_COOKIE)?.value)
    const applicationUser = profile
      ? null
      : await currentApplicationUser(cookieStore.get(APP_SESSION_COOKIE)?.value)
    const resolvedProfile = profile || (
      applicationUser?.profileId
        ? await getProfileById(applicationUser.profileId)
        : null
    )
    if (!resolvedProfile) {
      return {
        known: false,
        knownFields: [],
        knownAnswerFields: [],
      }
    }
    const knownFields: KnownLeadContext['knownFields'] = []
    if (resolvedProfile.identity.email) knownFields.push('email')
    if (resolvedProfile.identity.name) knownFields.push('name')
    if (resolvedProfile.identity.company) knownFields.push('company')
    if (resolvedProfile.identity.role) knownFields.push('role')
    if (resolvedProfile.identity.website) knownFields.push('website')
    const identity: Partial<KnownLeadContext['identity']> = {
      email: resolvedProfile.identity.email || undefined,
      name: resolvedProfile.identity.name || undefined,
      company: resolvedProfile.identity.company || undefined,
      role: resolvedProfile.identity.role || undefined,
      website: resolvedProfile.identity.website || undefined,
    }
    const fallbackAnswers = resolvedProfile.qualification
      ? resolvedProfile.qualification.answers
      : await latestQualificationAnswers(resolvedProfile.id)
    const hasQualification = Object.keys(fallbackAnswers).length > 0
    const fallbackScores = hasQualification
      ? calculateQualification(fallbackAnswers)
      : undefined
    const qualification = resolvedProfile.qualification
    const combinedAnswers = {
      ...resolvedProfile.identity,
      ...fallbackAnswers,
    }
    const knownAnswerFields = Object.entries(combinedAnswers)
      .filter(([, value]) =>
        typeof value === 'string' ? value.trim().length > 0 : value != null,
      )
      .map(([key]) => key)
    const answerValues = Object.fromEntries(
      Object.entries(combinedAnswers).filter(([, value]) =>
        typeof value === 'string' ? value.trim().length > 0 : value != null,
      ),
    )
    const recreationFrequency = fallbackAnswers.recreationFrequency
    const tier = fallbackScores ? qualificationTier(fallbackScores, fallbackAnswers) : undefined
    const outcome = tier ? qualificationOutcome(tier) : undefined
    return {
      known: true,
      knownFields,
      knownAnswerFields,
      identity,
      answerValues,
      requiresWebsite:
        Boolean(resolvedProfile.identity.email) &&
        !resolvedProfile.identity.website &&
        isPublicEmailDomain(emailDomain(resolvedProfile.identity.email || '')),
      scores: fallbackScores,
      qualificationTier: tier,
      qualificationOutcome: outcome,
      reasonCodes:
        fallbackScores && outcome
          ? qualificationReasonCodes(fallbackAnswers, fallbackScores, outcome)
          : undefined,
      missingFields:
        outcome === 'clarify' ? missingReadinessFields(fallbackAnswers) : [],
      assessmentCompleted: Boolean(
        resolvedProfile.qualification && fallbackAnswers.activeWorkflow,
      ),
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
