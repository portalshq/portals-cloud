import {after, NextResponse} from 'next/server'
import {
  leadRequestSchema,
  pilotRequestAnswersSchema,
  pilotRequiredAnswerFields,
  profileResetSchema,
  type LeadIdentity,
  type LeadRequest,
  type LeadResponse,
  type PilotAnswers,
} from '@/lib/leads/contracts'
import {hashValue, verifySignature} from '@/lib/leads/crypto'
import {APP_SESSION_COOKIE, currentApplicationUser, ensurePilotCustomerAccount, pilotMembershipRole} from '@/lib/leads/application-auth'
import {leadDownloadUrl} from '@/lib/leads/downloads'
import {normalizeEmail, validateIdentityForCapture} from '@/lib/leads/identity'
import {extractClientIp, sanitizeIp} from '@/lib/leads/ip-utils'
import {
  applyTransition,
  buildCommercialSnapshot,
  buildSecurityDecisions,
  buildSuccessCriteria,
  classifyPilot,
  computeUnresolved,
} from '@/lib/leads/pilot'
import {processLeadOutbox} from '@/lib/leads/processor'
import {
  changedPilotRoomFields,
  notifyPilotRoomEvent,
  pilotRoomSectionsForChanges,
} from '@/lib/leads/pilot-room-notifications'
import {commitPilotTermRevision, pilotMutableTermsFromState} from '@/lib/leads/pilot-room-revisions'
import {
  attachSubmissionToPilot,
  consumeRateLimit,
  createPilotRecord,
  enqueuePilotEmail,
  getPilotById,
  getProfileByEmail,
  getProfileById,
  getProfileByToken,
  latestQualificationAnswers,
  leadsDryRun,
  persistSubmission,
  PROFILE_COOKIE,
  PROFILE_MAX_AGE_SECONDS,
  updatePilot,
} from '@/lib/leads/store'
import {
  calculateQualification,
  commercialReadinessComplete,
  mergeQualificationAnswers,
  missingReadinessFields,
  qualificationOutcome,
  qualificationReasonCodes,
  qualificationTier,
  recommendedWorkflow,
} from '@/lib/leads/scoring'

export const runtime = 'nodejs'

const MAX_BODY_BYTES = 64 * 1024

function productionConfigurationError(request: LeadRequest): string | null {
  if (leadsDryRun()) return null
  const required = [
    'LEADS_DATABASE_URL',
    'LEADS_HASH_KEY',
    'LEADS_ENCRYPTION_KEY',
  ]
  if (request.provider !== 'apollo') {
    required.push('APOLLO_API_KEY')
  }
  if (request.submissionType !== 'commercial_event') {
    required.push('RESEND_API_KEY', 'LEADS_EMAIL_FROM')
  }
  if (
    ['assessment', 'pilot_request', 'pilot_brief_download', 'commercial_readiness', 'workflow_review', 'contact', 'security_download'].includes(
      request.submissionType,
    )
  ) {
    required.push('LEADS_NOTIFICATION_EMAIL')
  }
  if (request.consent.analytics) {
    required.push('MIXPANEL_PROJECT_TOKEN')
  }
  const missing = required.filter((name) => !process.env[name])
  return missing.length ? `Lead operations are missing: ${missing.join(', ')}` : null
}

function requestIp(request: Request): string {
  const ip = sanitizeIp(extractClientIp(request))
  return ip || 'unknown'
}

function validBrowserOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return process.env.NODE_ENV !== 'production'
  if (process.env.NODE_ENV !== 'production') {
    try {
      const hostname = new URL(origin).hostname
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
      ) {
        return true
      }
    } catch {
      return false
    }
  }
  const allowed = new Set([
    new URL(request.url).origin,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
    ...(process.env.LEADS_ALLOWED_ORIGINS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  ].filter(Boolean))
  return allowed.has(origin)
}

function routeResponse(
  request: LeadRequest,
  scores?: ReturnType<typeof calculateQualification>,
  qualificationAnswers?: Record<string, unknown>,
): LeadResponse {
  const tier = scores ? qualificationTier(scores, qualificationAnswers || request.answers) : undefined
  const outcome = tier ? qualificationOutcome(tier) : undefined
  const reasonCodes = scores && outcome
    ? qualificationReasonCodes(qualificationAnswers || request.answers, scores, outcome)
    : undefined
  const publicQualification = scores && tier && outcome
    ? {
        qualificationOutcome: outcome,
        reasonCodes,
        missingFields: outcome === 'clarify'
          ? missingReadinessFields(qualificationAnswers || request.answers)
          : [],
        workflowRiskScore: scores.workflowRiskScore,
      }
    : {}
  const workflow = recommendedWorkflow({
    ...(qualificationAnswers || request.answers),
    workflowRisk: request.attribution.useCase,
  })
  const downloadUrl = leadDownloadUrl(request.submissionType)
  if (downloadUrl) {
    return {ok: true, nextAction: 'download', downloadUrl}
  }
  if (request.submissionType === 'pilot_request') {
    const calendarUrl = process.env.PILOT_CALENDAR_URL
    return {
      ok: true,
      nextAction: calendarUrl ? 'calendar' : 'follow_up',
      ...(calendarUrl ? {calendarUrl} : {}),
      downloadUrl: '/api/leads/documents/pilot-packet',
      message: 'Your paid pilot request is recorded for review.',
    }
  }
  if (request.submissionType === 'contact') {
    return {ok: true, nextAction: 'follow_up', message: 'Your request is recorded.'}
  }
  if (
    ['assessment', 'commercial_readiness'].includes(request.submissionType) &&
    scores &&
    scores.fit.normalized >= 50 &&
    scores.pain.normalized >= 40 &&
    commercialReadinessComplete(qualificationAnswers || request.answers)
  ) {
    return {
      ok: true,
      nextAction: 'pilot_scope',
      ...publicQualification,
      qualificationOutcome: 'pilot_candidate',
      reasonCodes: qualificationReasonCodes(
        qualificationAnswers || request.answers,
        scores,
        'pilot_candidate',
      ),
      missingFields: [],
      recommendedWorkflow: workflow,
      message: 'Your workflow, the problem you described, and the practical context you shared support building a customized pilot plan.',
    }
  }
  if (request.submissionType === 'commercial_readiness' && scores) {
    return {
      ok: true,
      nextAction: 'use_case',
      qualificationOutcome: 'education',
      reasonCodes: qualificationReasonCodes(
        qualificationAnswers || request.answers,
        scores,
        'education',
      ),
      missingFields: [],
      workflowRiskScore: scores.workflowRiskScore,
      recommendedWorkflow: workflow,
      message:
        'The added context did not yet establish pilot readiness. Explore the relevant workflow, or build a free customized pilot plan if the assessment missed important context.',
    }
  }
  if (tier === 'high') {
    return {
      ok: true,
      nextAction: 'pilot_scope',
      ...publicQualification,
      recommendedWorkflow: workflow,
      ...(request.submissionType === 'assessment'
        ? {downloadUrl: '/api/leads/documents/assessment-result'}
        : {}),
      message: 'This workflow is a viable candidate for a paid production pilot.',
    }
  }
  if (tier === 'medium' || tier === 'incomplete') {
    if (request.submissionType === 'assessment' || request.submissionType === 'commercial_readiness') {
      return {
        ok: true,
        nextAction: 'use_case',
        ...publicQualification,
        qualificationOutcome: 'education',
        reasonCodes: qualificationReasonCodes(
          qualificationAnswers || request.answers,
          scores!,
          'education',
        ),
        missingFields: [],
        recommendedWorkflow: workflow,
        ...(request.submissionType === 'assessment'
          ? {downloadUrl: '/api/leads/documents/assessment-result'}
          : {}),
        message: 'Your answers point to a concrete workflow to improve. Explore that production pattern to see how Portals can reduce repeat work before deciding on a pilot.',
      }
    }
    return {
      ok: true,
      nextAction: 'commercial_clarification',
      ...publicQualification,
      recommendedWorkflow: workflow,
      message: 'This workflow may be viable; a few practical details will clarify pilot readiness.',
    }
  }
  return {
    ok: true,
    nextAction: 'use_case',
    ...publicQualification,
    recommendedWorkflow: workflow,
    ...(request.submissionType === 'assessment'
      ? {downloadUrl: '/api/leads/documents/assessment-result'}
      : {}),
    message: 'Based on the available information, education is the most useful next step.',
  }
}

async function syncPilotRecord(
  leadRequest: LeadRequest,
  submissionId: string,
  profileId: string,
  response: LeadResponse,
): Promise<LeadResponse> {
  if (leadRequest.submissionType !== 'pilot_request') return response
  const answers = leadRequest.answers as PilotAnswers
  const baseClassification = classifyPilot(answers)
  const assessmentOverride = answers.assessmentOrigin === 'assessment_override'
  const classification = assessmentOverride
    ? {
        ...baseClassification,
        route: 'one-call' as const,
        reasons: [
          ...baseClassification.reasons,
          'assessment override requires a qualification decision',
        ],
        exceptions: baseClassification.exceptions.some(
          (item) => item.kind === 'assessment-qualification',
        )
          ? baseClassification.exceptions
          : [
              ...baseClassification.exceptions,
              {
                kind: 'assessment-qualification',
                summary:
                  'The assessment did not establish a credible active workflow or sufficient fit and pain.',
                amendment:
                  'A founder qualification call must confirm or decline this pilot request.',
              },
            ],
      }
    : baseClassification
  const successCriteria = buildSuccessCriteria(answers)
  const securityDecisions = buildSecurityDecisions(answers)
  const unresolved = computeUnresolved(answers, {route: classification.route})
  const submitterEmail = leadRequest.identity?.email
  const submitterName = leadRequest.identity?.name
  const pilotAnswers = {
    ...answers,
    ...(submitterEmail ? {email: submitterEmail} : {}),
    ...(submitterName ? {name: submitterName} : {}),
  }

  if (leadRequest.pilotId) {
    const pilot = await getPilotById(leadRequest.pilotId)
    if (!pilot) return response
    if (pilot.profileId !== profileId) return response
    const transition = applyTransition(pilot.state, 'revise')
    if (!transition.allowed && pilot.state !== 'not_eligible') return response
    const nextAnswers = {
      ...(pilot.answers as Record<string, unknown>),
      ...answers,
      ...(submitterEmail ? {email: submitterEmail} : {}),
      ...(submitterName ? {name: submitterName} : {}),
    }
    const proposal = buildCommercialSnapshot(answers, [], {
      startDate: pilot.resolvedStartDate || undefined,
    })
    const at = new Date().toISOString()
    const roomChanges = changedPilotRoomFields({
      before: pilot,
      after: {answers: nextAnswers, securityDecisions},
      at,
      by: submitterEmail,
    })
    const committed = commitPilotTermRevision({
      pilot,
      nextTerms: pilotMutableTermsFromState({
        resolvedStartDate: pilot.resolvedStartDate,
        proposal,
        successCriteria,
        answers: nextAnswers,
      }),
      actor: submitterEmail,
      extraChanges: roomChanges,
      at,
    })
    const updated = await updatePilot(pilot.id, {
      state: assessmentOverride ? 'exception_review' : 'reviewing',
      action: 'revise',
      route: classification.route,
      answers: nextAnswers,
      exceptions: classification.exceptions,
      unresolved,
      successCriteria,
      securityDecisions,
      proposal,
      version: committed.version,
      draft: committed.draft,
      revisions: committed.revisions,
      historyNote: 'revision submitted',
    })
    if (committed.version > pilot.version) {
      const stale = updated.reviewers.filter(
        (reviewer) =>
          reviewer.status !== 'revoked' &&
          reviewer.status !== 'proposed' &&
          reviewer.versionSeen < committed.version &&
          reviewer.email,
      )
      for (const reviewer of stale) {
        try {
          await enqueuePilotEmail(updated.id, 'revised_ready', reviewer.email)
        } catch (cause) {
          console.error('revised_ready email failed', cause)
        }
      }
      await notifyPilotRoomEvent({
        pilot: updated,
        event: 'terms_changed',
        sections: pilotRoomSectionsForChanges(committed.changes),
        eventKey: `revision:${updated.version}`,
      })
    }
    try {
      await enqueuePilotEmail(updated.id, 'revised')
    } catch (cause) {
      console.error('revised email failed', cause)
    }
    return {
      ...response,
      nextAction: 'pilot_room',
      pilotUrl: `/paid-pilot/room/${updated.id}`,
      pilotState: updated.state,
      pilotRoute: updated.route,
      message: 'Your revised pilot plan is back under review in your approval room.',
    }
  }

  const pilot = await createPilotRecord({
    profileId,
    initialSubmissionId: submissionId,
    answers: pilotAnswers,
    route: classification.route,
    state: assessmentOverride
      ? 'exception_review'
      : classification.route === 'disqualified'
        ? 'not_eligible'
        : 'reviewing',
    exceptions: classification.exceptions,
    unresolved,
    successCriteria,
    securityDecisions,
  })
  await ensurePilotCustomerAccount({
    pilotId: pilot.id,
    profile: await getProfileById(profileId),
    companyName: leadRequest.identity?.company,
  })
  await updatePilot(pilot.id, {
    proposal: buildCommercialSnapshot(answers, [], {}),
  })
  await attachSubmissionToPilot(submissionId, pilot.id)
  try {
    await enqueuePilotEmail(pilot.id, 'reviewing')
  } catch (cause) {
    console.error('pilot email failed', cause)
  }
  return {
    ...response,
    nextAction: 'pilot_room',
    pilotUrl: `/paid-pilot/room/${pilot.id}`,
    pilotState: pilot.state,
    pilotRoute: pilot.route,
    message:
      assessmentOverride
        ? 'Your free customized pilot plan is ready in the approval room. A qualification call is required before the pilot can proceed.'
        : pilot.route === 'disqualified'
        ? 'Your pilot request needs clarification before it can proceed.'
        : pilot.route === 'one-call'
          ? 'Your pilot approval room is ready with your free customized plan. A short pilot terms review is required before signing.'
          : 'Your pilot approval room is ready with your free customized plan. The $5,000 fee applies only if you approve and conduct the pilot.',
  }
}

async function handleLeadRequest(
  request: Request,
  leadRequest: LeadRequest,
  verified: boolean,
  boundProfileId?: string,
): Promise<NextResponse> {
  const configurationError = productionConfigurationError(leadRequest)
  if (configurationError) {
    console.error(configurationError)
    return NextResponse.json(
      {ok: false, error: 'requests are temporarily unavailable. please try again.'},
      {status: 503},
    )
  }
  if (leadRequest.companyFax) {
    return NextResponse.json({ok: true, nextAction: 'follow_up'})
  }

  // Capture client IP for geolocation
  let clientIp: string | null = null
  try {
    clientIp = sanitizeIp(extractClientIp(request))
  } catch (error) {
    console.error('Error extracting client IP for lead request:', error)
  }
  const effectiveLeadRequest: LeadRequest = {
    ...leadRequest,
    attribution: {
      ...leadRequest.attribution,
      clientIp: clientIp || '',
    },
  }

  const profileToken = request.headers.get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${PROFILE_COOKIE}=`))
    ?.slice(PROFILE_COOKIE.length + 1)
  let profile = boundProfileId
    ? await getProfileById(boundProfileId).catch(() => null)
    : await getProfileByToken(profileToken)
  const incomingIdentity: Partial<LeadIdentity> = effectiveLeadRequest.identity || {}
  if (
    profile?.identity.email &&
    incomingIdentity.email &&
    normalizeEmail(profile.identity.email) !== normalizeEmail(incomingIdentity.email)
  ) {
    profile = null
  }
  const identity: LeadIdentity = {
    name: incomingIdentity.name || profile?.identity.name,
    email: incomingIdentity.email || profile?.identity.email,
    company: incomingIdentity.company || profile?.identity.company,
    role: incomingIdentity.role || profile?.identity.role,
    website: incomingIdentity.website || profile?.identity.website || '',
  }
  const identityError = validateIdentityForCapture(identity)
  if (identityError) {
    return NextResponse.json({ok: false, error: identityError}, {status: 400})
  }

  const priorAnswers = profile
    ? await latestQualificationAnswers(profile.id)
    : {}
  let qualificationAnswers = mergeQualificationAnswers(
    priorAnswers,
    effectiveLeadRequest.answers,
    ...(effectiveLeadRequest.submissionType === 'workflow_review'
      ? [{workflowReviewRequested: true}]
      : []),
    ...(effectiveLeadRequest.submissionType === 'assessment' || effectiveLeadRequest.submissionType === 'commercial_readiness'
      ? [{commercialReadinessCompleted: true}]
      : []),
    ...(effectiveLeadRequest.submissionType === 'pilot_request'
      ? [{
          activeWorkflow: effectiveLeadRequest.answers.pilotWorkflow,
          targetStartPeriod: effectiveLeadRequest.answers.targetStartPeriod,
          stakeholderInvolved: true,
          pricingOrPilotViewed: true,
        }]
      : []),
  )
  if (effectiveLeadRequest.submissionType === 'pilot_request') {
    qualificationAnswers = mergeQualificationAnswers(qualificationAnswers, {
      pilotWorkflow:
        qualificationAnswers.pilotWorkflow || qualificationAnswers.activeWorkflow,
    })
  }
  if (effectiveLeadRequest.submissionType === 'assessment' || effectiveLeadRequest.submissionType === 'commercial_readiness') {
    const readiness = effectiveLeadRequest.answers
    qualificationAnswers = mergeQualificationAnswers(qualificationAnswers, {
      ...(readiness.objectionDetail
        ? {pilotBlocker: readiness.objectionDetail}
        : {}),
      ...(readiness.primaryObjection === 'integration' && readiness.objectionDetail
        ? {requiredIntegrations: readiness.objectionDetail}
        : {}),
      ...(readiness.primaryObjection === 'security' && readiness.objectionDetail
        ? {securityRequirements: readiness.objectionDetail}
        : {}),
    })
  }
  const finalLeadRequest: LeadRequest =
    effectiveLeadRequest.submissionType === 'pilot_request'
      ? {
          ...effectiveLeadRequest,
          identity,
          answers: pilotRequestAnswersSchema.parse({
            ...effectiveLeadRequest.answers,
            ...Object.fromEntries(
              pilotRequiredAnswerFields.map((field) => [
                field,
                String(qualificationAnswers[field] || ''),
              ]),
            ),
          }),
        }
      : {...effectiveLeadRequest, identity}
  if (
    finalLeadRequest.submissionType === 'pilot_request' &&
    pilotRequiredAnswerFields.some(
      (field) => !finalLeadRequest.answers[field].trim(),
    )
  ) {
    return NextResponse.json(
      {ok: false, error: 'please complete every required pilot field'},
      {status: 400},
    )
  }
  const scoreable = ['assessment', 'commercial_readiness', 'workflow_review', 'pilot_request'].includes(
    finalLeadRequest.submissionType,
  )
  const scores = scoreable ? calculateQualification(qualificationAnswers) : undefined
  const tier = scores ? qualificationTier(scores, qualificationAnswers) : undefined
  const response = routeResponse(finalLeadRequest, scores, qualificationAnswers)
  const persisted = await persistSubmission({
    request: finalLeadRequest,
    identity,
    scores,
    tier,
    response: {
      ...response,
      provisional: !verified || undefined,
      dryRun: leadsDryRun() || undefined,
      message: leadsDryRun()
        ? `${response.message || ''} Local dry-run mode: no external systems were contacted.`.trim()
        : response.message,
    },
    verified,
    currentProfileToken: profileToken,
    qualificationAnswers: scoreable ? qualificationAnswers : undefined,
  })
  const finalResponse = {
    ...persisted.submission.response,
    analyticsPersonId: persisted.submission.profile.analyticsPersonId,
  }
  const pilotResponse =
    finalLeadRequest.submissionType === 'pilot_request'
      ? await syncPilotRecord(
          finalLeadRequest,
          persisted.submission.id,
          persisted.submission.profile.id,
          finalResponse,
        )
      : finalResponse
  const nextResponse = NextResponse.json(pilotResponse)
  if (persisted.profileToken) {
    nextResponse.cookies.set(PROFILE_COOKIE, persisted.profileToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: PROFILE_MAX_AGE_SECONDS,
    })
  }
  if (verified && !leadsDryRun()) after(() => processLeadOutbox(10))
  return nextResponse
}

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get('content-length') || 0)
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ok: false, error: 'request is too large'}, {status: 413})
  }
  const rawBody = await request.text()
  if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) {
    return NextResponse.json({ok: false, error: 'request is too large'}, {status: 413})
  }

  const providerSignature = request.headers.get('x-portals-signature')
  if (providerSignature) {
    if (!process.env.APOLLO_CALLBACK_SECRET) {
      return NextResponse.json({ok: false, error: 'provider callback unavailable'}, {status: 503})
    }
    if (!verifySignature(rawBody, providerSignature, 'APOLLO_CALLBACK_SECRET')) {
      return NextResponse.json({ok: false, error: 'invalid signature'}, {status: 401})
    }
    let parsedBody: unknown
    try {
      parsedBody = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ok: false, error: 'invalid request body'}, {status: 400})
    }
    const parsed = leadRequestSchema.safeParse(parsedBody)
    if (
      !parsed.success ||
      parsed.data.submissionType !== 'commercial_event' ||
      parsed.data.provider !== 'apollo'
    ) {
      return NextResponse.json({ok: false, error: 'invalid provider event'}, {status: 400})
    }
    const profile = await getProfileByEmail(parsed.data.identity?.email)
    if (!profile) {
      return NextResponse.json({ok: false, error: 'lead profile not found'}, {status: 404})
    }
    return handleLeadRequest(
      request,
      {
        ...parsed.data,
        consent: {
          ...parsed.data.consent,
          marketing: profile.marketingConsent,
          analytics: profile.analyticsConsent,
        },
      },
      true,
      profile.id,
    )
  }

  if (!validBrowserOrigin(request)) {
    return NextResponse.json({ok: false, error: 'invalid origin'}, {status: 403})
  }
  let json: unknown
  try {
    json = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ok: false, error: 'invalid request body'}, {status: 400})
  }
  const reset = profileResetSchema.safeParse(json)
  if (reset.success) {
    const response = NextResponse.json({ok: true, nextAction: 'follow_up'})
    const cookieOptions = {
      path: '/',
      maxAge: 0,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      expires: new Date(0),
    }
    response.cookies.set(PROFILE_COOKIE, '', cookieOptions)
    response.cookies.set(APP_SESSION_COOKIE, '', cookieOptions)
    return response
  }
  if (
    !leadsDryRun() &&
    (!process.env.LEADS_DATABASE_URL || !process.env.LEADS_HASH_KEY)
  ) {
    console.error('Lead intake requires LEADS_DATABASE_URL and LEADS_HASH_KEY.')
    return NextResponse.json(
      {ok: false, error: 'requests are temporarily unavailable. please try again.'},
      {status: 503},
    )
  }
  const sessionToken = request.headers.get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${PROFILE_COOKIE}=`))
    ?.slice(PROFILE_COOKIE.length + 1)
  const allowed = await consumeRateLimit(
    hashValue(`lead:${requestIp(request)}:${sessionToken || 'anonymous'}`),
  )
  if (!allowed) {
    return NextResponse.json({ok: false, error: 'too many requests'}, {status: 429})
  }
  const parsed = leadRequestSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      {ok: false, error: 'please complete every required field'},
      {status: 400},
    )
  }
  if (!['browser', 'apollo'].includes(parsed.data.provider)) {
    return NextResponse.json({ok: false, error: 'invalid provider'}, {status: 400})
  }
  const applicationSession = request.headers.get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${APP_SESSION_COOKIE}=`))
    ?.slice(APP_SESSION_COOKIE.length + 1)
  const applicationUser = await currentApplicationUser(applicationSession)
  const revisedPilotId = 'pilotId' in parsed.data ? parsed.data.pilotId : undefined
  if (revisedPilotId) {
    const role = applicationUser
      ? await pilotMembershipRole(revisedPilotId, applicationUser.id)
      : null
    if (!applicationUser?.profileId || role !== 'owner') {
      return NextResponse.json({ok: false, error: 'only the pilot account owner can submit a revision'}, {status: 403})
    }
    return handleLeadRequest(request, parsed.data, true, applicationUser.profileId)
  }
  return handleLeadRequest(request, parsed.data, true)
}
