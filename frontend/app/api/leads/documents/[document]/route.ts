import {renderToBuffer} from '@react-pdf/renderer'
import {zipSync} from 'fflate'
import {
  AssessmentResultPdfDocument,
  PersonalizedPilotPdfDocument,
  PilotPlanPdfDocument,
  type PersonalizedQualification,
} from '@/components/pdf/PersonalizedLeadPdfDocuments'
import {leadDownloadUrl} from '@/lib/leads/downloads'
import {hashValue} from '@/lib/leads/crypto'
import {verifyRoomToken} from '@/lib/leads/pilot-tokens'
import {currentProfileToken} from '@/lib/leads/profile'
import {calculateQualification, qualificationTier, recommendedWorkflow} from '@/lib/leads/scoring'
import {
  consumeRateLimit,
  getPilotById,
  getProfileByToken,
  latestPilotByProfile,
  latestQualificationAnswers,
  leadsDryRun,
} from '@/lib/leads/store'
import {getResourceDocument} from '@/sanity/lib/resources'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

function filePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

function pdfResponse(buffer: Buffer, fileName: string): Response {
  return new Response(new Uint8Array(buffer).buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

export async function GET(
  request: Request,
  {params}: {params: Promise<{document: string}>},
) {
  const {document: documentKind} = await params
  if (!['assessment-result', 'pilot-packet'].includes(documentKind)) {
    return Response.json({error: 'document not found'}, {status: 404})
  }

  const query = new URL(request.url).searchParams
  const roomAccess = query.get('t') ? verifyRoomToken(query.get('t') as string) : null
  const roomPilot = roomAccess ? await getPilotById(roomAccess.pilotId) : null

  if (documentKind === 'pilot-packet' && roomPilot) {
    const generatedAt = new Date().toISOString()
    const pilotBuffer = await renderToBuffer(
      PilotPlanPdfDocument({pilot: roomPilot, generatedAt}),
    )
    const securityUrl = leadDownloadUrl('security_download')
    if (!securityUrl) {
      return Response.json({error: 'security brief is unavailable'}, {status: 503})
    }
    const securityResponse = await fetch(securityUrl, {cache: 'no-store'})
    if (!securityResponse.ok) {
      return Response.json({error: 'security brief is unavailable'}, {status: 503})
    }
    const securityBuffer = new Uint8Array(await securityResponse.arrayBuffer())
    const company =
      filePart(String(roomPilot.answers.company || 'company')) || 'company'
    const packet = zipSync(
      {
        [`${company}-paid-production-pilot-plan.pdf`]: new Uint8Array(pilotBuffer),
        'portals-security-and-architecture-brief.pdf': securityBuffer,
      },
      {level: 0},
    )
    return new Response(new Uint8Array(packet).buffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${company}-portals-pilot-packet.zip"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }

  const profileToken = await currentProfileToken()
  if (
    profileToken &&
    !leadsDryRun() &&
    !(await consumeRateLimit(hashValue(`document:${profileToken}`), 6))
  ) {
    return Response.json({error: 'too many document requests'}, {status: 429})
  }
  const profile = await getProfileByToken(profileToken)
  if (!profile) {
    return Response.json(
      {error: 'complete the corresponding form in this browser first'},
      {status: 401},
    )
  }
  const fallbackAnswers = profile.qualification
    ? profile.qualification.answers
    : await latestQualificationAnswers(profile.id)
  if (!Object.keys(fallbackAnswers).length) {
    return Response.json(
      {error: 'your verified assessment is still being prepared; please try again'},
      {status: 409},
    )
  }

  const fallbackScores = calculateQualification(fallbackAnswers)
  const data: PersonalizedQualification = {
    identity: profile.identity,
    answers: fallbackAnswers,
    scores: profile.qualification?.scores || fallbackScores,
    tier: profile.qualification?.tier || qualificationTier(fallbackScores),
    recommendedWorkflow:
      profile.qualification?.recommendedWorkflow ||
      recommendedWorkflow(fallbackAnswers),
    generatedAt: new Date().toISOString(),
  }
  const company = filePart(profile.identity.company || 'company') || 'company'

  if (documentKind === 'assessment-result') {
    const buffer = await renderToBuffer(
      AssessmentResultPdfDocument({data}),
    )
    return pdfResponse(buffer, `${company}-production-workflow-assessment.pdf`)
  }

  const requiredPilotFields = [
    'productionOwner',
    'economicBuyer',
    'technicalEvaluator',
    'requiredIntegrations',
    'targetStartPeriod',
    'successCriteria',
    'securityRequirements',
    'annualExpectations',
    'budgetReadiness',
    'budgetOwner',
  ]
  if (
    requiredPilotFields.some(
      (field) =>
        typeof data.answers[field] !== 'string' ||
        !data.answers[field].trim(),
    )
  ) {
    return Response.json(
      {error: 'complete the paid pilot scope before downloading the packet'},
      {status: 409},
    )
  }

  const pilotDocument = await getResourceDocument('paid-pilot')
  if (!pilotDocument) {
    return Response.json({error: 'pilot brief content is unavailable'}, {status: 503})
  }
  const latestPilot = await latestPilotByProfile(profile.id)
  const pilotBuffer = latestPilot
    ? await renderToBuffer(
        PilotPlanPdfDocument({pilot: latestPilot, generatedAt: new Date().toISOString()}),
      )
    : await renderToBuffer(
        PersonalizedPilotPdfDocument({
          data,
          document: pilotDocument,
        }),
      )
  const pilotFileName = latestPilot
    ? `${company}-paid-production-pilot-plan.pdf`
    : `${company}-paid-production-pilot-brief.pdf`
  const securityUrl = leadDownloadUrl('security_download')
  if (!securityUrl) {
    return Response.json({error: 'security brief is unavailable'}, {status: 503})
  }
  const securityResponse = await fetch(securityUrl, {cache: 'no-store'})
  if (!securityResponse.ok) {
    return Response.json({error: 'security brief is unavailable'}, {status: 503})
  }
  const securityBuffer = new Uint8Array(await securityResponse.arrayBuffer())
  const packet = zipSync(
    {
      [pilotFileName]: new Uint8Array(pilotBuffer),
      'portals-security-and-architecture-brief.pdf': securityBuffer,
    },
    {level: 0},
  )

  return new Response(new Uint8Array(packet).buffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${company}-portals-pilot-packet.zip"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
