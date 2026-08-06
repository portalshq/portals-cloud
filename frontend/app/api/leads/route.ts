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
import {leadDownloadUrl} from '@/lib/leads/downloads'
import {normalizeEmail, validateIdentityForCapture} from '@/lib/leads/identity'
import {
  applyTransition,
  buildCommercialSnapshot,
  buildSecurityDecisions,
  buildSuccessCriteria,
  classifyPilot,
  computeUnresolved,
} from '@/lib/leads/pilot'
import {verifyTallyContext} from '@/lib/leads/profile'
import {processLeadOutbox} from '@/lib/leads/processor'
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
  mergeQualificationAnswers,
  qualificationTier,
  recommendedWorkflow,
} from '@/lib/leads/scoring'
import {tallyContextFromPayload, tallyLeadRequest} from '@/lib/leads/tally'

export const runtime = 'nodejs'

const MAX_BODY_BYTES = 64 * 1024

function productionConfigurationError(request: LeadRequest): string | null {
  if (leadsDryRun()) return null
  const required = [
    'LEADS_DATABASE_URL',
    'LEADS_HASH_KEY',
    'LEADS_ENCRYPTION_KEY',
  ]
  const verifiedProvider = request.provider !== 'tally_client'
  if (verifiedProvider && request.provider !== 'attio') {
    required.push('ATTIO_API_KEY')
  }
  if (
    verifiedProvider &&
    request.submissionType !== 'assessment' &&
    request.submissionType !== 'commercial_event'
  ) {
    required.push('RESEND_API_KEY', 'LEADS_EMAIL_FROM')
  }
  if (
    verifiedProvider &&
    ['pilot_request', 'pilot_brief_download', 'workflow_review', 'contact', 'security_download'].includes(
      request.submissionType,
    )
  ) {
    required.push('LEADS_NOTIFICATION_EMAIL')
  }
  if (verifiedProvider && request.consent.analytics) {
    required.push('MIXPANEL_PROJECT_TOKEN')
  }
  const missing = required.filter((name) => !process.env[name])
  return missing.length ? `Lead operations are missing: ${missing.join(', ')}` : null
}

function requestIp(request: Request): string {
  return (
    request.headers.get('x-vercel-forwarded-for') ||
    request.headers.get('x-forwarded-for') ||
    'unknown'
  ).split(',')[0].trim()
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
  const tier = scores ? qualificationTier(scores) : undefined
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
  if (tier === 'high') {
    return {
      ok: true,
      nextAction: 'pilot_scope',
      qualificationTier: tier,
      scores,
      recommendedWorkflow: workflow,
      ...(request.submissionType === 'assessment'
        ? {downloadUrl: '/api/leads/documents/assessment-result'}
        : {}),
      message: 'Your workflow appears to be a strong fit for a paid production pilot.',
    }
  }
  if (tier === 'medium' || tier === 'incomplete') {
    return {
      ok: true,
      nextAction: 'assessment_review',
      qualificationTier: tier,
      scores,
      recommendedWorkflow: workflow,
      ...(request.submissionType === 'assessment'
        ? {downloadUrl: '/api/leads/documents/assessment-result'}
        : {}),
      message: 'Your workflow has relevant signals and needs a closer review.',
    }
  }
  return {
    ok: true,
    nextAction: 'use_case',
    qualificationTier: tier || 'low',
    scores,
    recommendedWorkflow: workflow,
    ...(request.submissionType === 'assessment'
      ? {downloadUrl: '/api/leads/documents/assessment-result'}
      : {}),
    message: 'The most useful next step is to explore the relevant workflow.',
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
  const classification = classifyPilot(answers)
  const successCriteria = buildSuccessCriteria(answers)
  const securityDecisions = buildSecurityDecisions(answers)
  const unresolved = computeUnresolved(answers, {route: classification.route})

  if (leadRequest.pilotId) {
    const pilot = await getPilotById(leadRequest.pilotId)
    if (!pilot) return response
    if (pilot.profileId !== profileId) return response
    const transition = applyTransition(pilot.state, 'revise')
    if (!transition.allowed && pilot.state !== 'not_eligible') return response
    const frozen =
      pilot.state === 'team_review' ||
      pilot.state === 'scope_confirmed' ||
      pilot.state === 'exception_review' ||
      pilot.state === 'ready_sign' ||
      pilot.state === 'signed'
    const version = frozen ? pilot.version + 1 : pilot.version
    const updated = await updatePilot(pilot.id, {
      state: 'reviewing',
      action: 'revise',
      route: classification.route,
      answers: {
        ...(pilot.answers as Record<string, unknown>),
        ...answers,
      },
      exceptions: classification.exceptions,
      unresolved,
      successCriteria,
      securityDecisions,
      proposal: buildCommercialSnapshot(answers, [], {
        startDate: pilot.resolvedStartDate || undefined,
      }),
      version,
      historyNote: 'revision submitted',
    })
    if (version > pilot.version) {
      const stale = updated.reviewers.filter(
        (reviewer) =>
          reviewer.status !== 'revoked' &&
          reviewer.status !== 'proposed' &&
          reviewer.versionSeen < version &&
          reviewer.email,
      )
      for (const reviewer of stale) {
        try {
          await enqueuePilotEmail(updated.id, 'revised_ready', reviewer.email)
        } catch (cause) {
          console.error('revised_ready email failed', cause)
        }
      }
    }
    try {
      await enqueuePilotEmail(updated.id, 'revised')
    } catch (cause) {
      console.error('revised email failed', cause)
    }
    return {
      ...response,
      nextAction: 'pilot_room',
      pilotUrl: `/pilot/${updated.id}`,
      pilotState: updated.state,
      pilotRoute: updated.route,
      message: 'Your revised pilot plan is back under review in your approval room.',
    }
  }

  const pilot = await createPilotRecord({
    profileId,
    initialSubmissionId: submissionId,
    answers,
    route: classification.route,
    state: classification.route === 'disqualified' ? 'not_eligible' : 'reviewing',
    exceptions: classification.exceptions,
    unresolved,
    successCriteria,
    securityDecisions,
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
    pilotUrl: `/pilot/${pilot.id}`,
    pilotState: pilot.state,
    pilotRoute: pilot.route,
    message:
      pilot.route === 'disqualified'
        ? 'Your pilot request needs clarification before it can proceed.'
        : pilot.route === 'one-call'
          ? 'Your personalized pilot approval room is ready. A short pilot terms review is required before signing.'
          : 'Your personalized pilot approval room is ready. Review the plan, confirm the scope, and sign when ready.',
  }
}

async function handleLeadRequest(
  request: Request,
  leadRequest: LeadRequest,
  verified: boolean,
  tallyProfileId?: string,
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

  const profileToken = request.headers.get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${PROFILE_COOKIE}=`))
    ?.slice(PROFILE_COOKIE.length + 1)
  let profile = tallyProfileId
    ? await getProfileById(tallyProfileId).catch(() => null)
    : await getProfileByToken(profileToken)
  const incomingIdentity: Partial<LeadIdentity> = leadRequest.identity || {}
  if (
    profile?.identity.email &&
    incomingIdentity.email &&
    normalizeEmail(profile.identity.email) !== normalizeEmail(incomingIdentity.email)
  ) {
    profile = null
  }
  const identity: LeadIdentity = {
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
    leadRequest.answers,
    ...(leadRequest.submissionType === 'workflow_review'
      ? [{workflowReviewRequested: true}]
      : []),
    ...(leadRequest.submissionType === 'pilot_request'
      ? [{
          activeWorkflow: leadRequest.answers.pilotWorkflow,
          timeline: leadRequest.answers.targetStartPeriod,
          stakeholderInvolved: true,
          pricingOrPilotViewed: true,
        }]
      : []),
  )
  if (leadRequest.submissionType === 'pilot_request') {
    qualificationAnswers = mergeQualificationAnswers(qualificationAnswers, {
      pilotWorkflow:
        qualificationAnswers.pilotWorkflow || qualificationAnswers.activeWorkflow,
    })
  }
  const effectiveLeadRequest: LeadRequest =
    leadRequest.submissionType === 'pilot_request'
      ? {
          ...leadRequest,
          answers: pilotRequestAnswersSchema.parse({
            ...leadRequest.answers,
            ...Object.fromEntries(
              pilotRequiredAnswerFields.map((field) => [
                field,
                String(qualificationAnswers[field] || ''),
              ]),
            ),
          }),
        }
      : leadRequest
  if (
    effectiveLeadRequest.submissionType === 'pilot_request' &&
    pilotRequiredAnswerFields.some(
      (field) => !effectiveLeadRequest.answers[field].trim(),
    )
  ) {
    return NextResponse.json(
      {ok: false, error: 'please complete every required pilot field'},
      {status: 400},
    )
  }
  const scoreable = ['assessment', 'workflow_review', 'pilot_request'].includes(
    leadRequest.submissionType,
  )
  const scores = scoreable ? calculateQualification(qualificationAnswers) : undefined
  const tier = scores ? qualificationTier(scores) : undefined
  const response = routeResponse(effectiveLeadRequest, scores, qualificationAnswers)
  const persisted = await persistSubmission({
    request: effectiveLeadRequest,
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
    effectiveLeadRequest.submissionType === 'pilot_request'
      ? await syncPilotRecord(
          effectiveLeadRequest,
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

  const tallySignature = request.headers.get('tally-signature')
  if (tallySignature) {
    if (!process.env.TALLY_WEBHOOK_SECRET) {
      return NextResponse.json({ok: false, error: 'webhook unavailable'}, {status: 503})
    }
    if (!verifySignature(rawBody, tallySignature, 'TALLY_WEBHOOK_SECRET', 'base64')) {
      return NextResponse.json({ok: false, error: 'invalid signature'}, {status: 401})
    }
    try {
      const payload = JSON.parse(rawBody) as Record<string, unknown>
      const tallyContext = tallyContextFromPayload(payload)
      const context = tallyContext ? verifyTallyContext(tallyContext) : null
      return handleLeadRequest(
        request,
        tallyLeadRequest(payload, 'tally_webhook'),
        true,
        context?.profileId,
      )
    } catch (error) {
      console.error('Invalid Tally webhook:', error)
      return NextResponse.json({ok: false, error: 'invalid webhook'}, {status: 400})
    }
  }

  const providerSignature = request.headers.get('x-portals-signature')
  if (providerSignature) {
    if (!process.env.ATTIO_CALLBACK_SECRET) {
      return NextResponse.json({ok: false, error: 'provider callback unavailable'}, {status: 503})
    }
    if (!verifySignature(rawBody, providerSignature, 'ATTIO_CALLBACK_SECRET')) {
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
      parsed.data.provider !== 'attio'
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
  let json: unknown
  try {
    json = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ok: false, error: 'invalid request body'}, {status: 400})
  }
  const reset = profileResetSchema.safeParse(json)
  if (reset.success) {
    const response = NextResponse.json({ok: true, nextAction: 'follow_up'})
    response.cookies.set(PROFILE_COOKIE, '', {path: '/', maxAge: 0})
    return response
  }
  const parsed = leadRequestSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      {ok: false, error: 'please complete every required field'},
      {status: 400},
    )
  }
  if (!['browser', 'tally_client'].includes(parsed.data.provider)) {
    return NextResponse.json({ok: false, error: 'invalid provider'}, {status: 400})
  }
  return handleLeadRequest(
    request,
    parsed.data,
    parsed.data.provider !== 'tally_client',
  )
}
