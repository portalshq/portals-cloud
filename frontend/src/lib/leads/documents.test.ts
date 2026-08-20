import assert from 'node:assert/strict'
import test from 'node:test'
import {renderToBuffer} from '@react-pdf/renderer'
import {
  ASSESSMENT_PDF_FILE_NAME,
  AssessmentResultPdfDocument,
  PersonalizedPilotPdfDocument,
  PilotPlanPdfDocument,
  type PersonalizedQualification,
} from '@/components/pdf/PersonalizedLeadPdfDocuments'
import {buildCommercialSnapshot, buildSecurityDecisions, buildSuccessCriteria} from './pilot'
import type {StoredPilot} from './store'
import type {ResourceDocument} from '@/types/resource'
import {calculateQualification, qualificationTier} from './scoring'

const answers = {
  teamType: 'creative-studio',
  teamSize: '5-9',
  workflowCollaborators: '5-9',
  toolsUsed: '5-plus',
  recurringWorkflow: 'weekly',
  assetVolume: '100-499',
  approvedVersionMethod: 'creator-memory',
  productionContextMethod: 'memory-inconsistent',
  recreationFrequency: 'weekly',
  incidentType: 'failed-reproduction',
  peopleAffected: '5-9',
  hoursLost: '1-4-hours',
  deliveryImpact: 'client-affected',
  activeWorkflow: 'campaign variant production',
  pilotWorkflow: 'campaign variant production',
  productionOwner: 'production director',
  economicBuyer: 'chief creative officer',
  technicalEvaluator: 'workflow lead',
  requiredIntegrations: 'shared storage and review exports',
  targetStartPeriod: 'within-30-days',
  successCriteria: 'recover and reproduce one approved campaign asset',
  securityRequirements: 'review data isolation and export controls',
  budgetReadiness: 'pilot-approved',
  budgetOwner: 'production',
}
const scores = calculateQualification({
  ...answers,
  timeline: 'within-30-days',
  workflowReviewRequested: true,
  stakeholderInvolved: true,
})
const data: PersonalizedQualification = {
  identity: {
    email: 'lead@studio.example',
    company: 'Studio Example',
    role: 'production-operations',
    website: '',
  },
  answers,
  scores,
  tier: qualificationTier(scores),
  recommendedWorkflow: 'campaign-variant-control',
  generatedAt: '2026-08-01T12:00:00.000Z',
}

test('personalized assessment and pilot documents render as PDFs', async () => {
  const assessment = await renderToBuffer(AssessmentResultPdfDocument({data}))
  const pilot = await renderToBuffer(
    PersonalizedPilotPdfDocument({
      data,
      document: {packageSpecifications: []} as unknown as ResourceDocument,
    }),
  )

  assert.equal(assessment.subarray(0, 4).toString(), '%PDF')
  assert.equal(pilot.subarray(0, 4).toString(), '%PDF')
  assert.ok(assessment.length > 1_000)
  assert.ok(pilot.length > 1_000)
  assert.equal(assessment.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length, 5)
  assert.equal(pilot.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length, 2)
  assert.equal(ASSESSMENT_PDF_FILE_NAME, 'portals-production-workflow-evaluation.pdf')
})

test('maximum-length pilot answers remain a two-page brief', async () => {
  const longData: PersonalizedQualification = {
    ...data,
    answers: {
      ...answers,
      pilotWorkflow: 'workflow '.repeat(250),
      productionOwner: 'production owner '.repeat(20),
      economicBuyer: 'economic buyer '.repeat(20),
      technicalEvaluator: 'technical evaluator '.repeat(20),
      requiredIntegrations: 'integration requirement '.repeat(60),
      successCriteria: 'measurable success criterion '.repeat(80),
      securityRequirements: 'security requirement '.repeat(100),
    },
  }
  const pilot = await renderToBuffer(
    PersonalizedPilotPdfDocument({
      data: longData,
      document: {packageSpecifications: []} as unknown as ResourceDocument,
    }),
  )

  assert.equal(pilot.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length, 2)
})

test('long assessment inputs remain a five-page evaluation', async () => {
  const longData: PersonalizedQualification = {
    ...data,
    identity: {
      ...data.identity,
      name: 'Assessment Sponsor '.repeat(8),
      company: 'International Production Organization '.repeat(5),
      role: 'Global Production Operations Director '.repeat(4),
    },
    answers: {
      ...answers,
      activeWorkflow: 'Recurring campaign production workflow '.repeat(50),
      incidentDescription: 'Missing production context delayed delivery. '.repeat(50),
      message: 'Additional production detail. '.repeat(100),
    },
  }
  const assessment = await renderToBuffer(AssessmentResultPdfDocument({data: longData}))

  assert.equal(assessment.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length, 5)
})

const pilotAnswers = {
  ...answers,
  company: 'Studio Example',
  pilotWorkflow: 'campaign variant production',
  integrationMethod: 'shared-storage',
  dataClassification: 'confidential',
  participantsRange: '2-4',
  signerName: 'Ava Nguyen',
  signerEmail: 'ava@studio.example',
}

function storedPilot(overrides: Partial<StoredPilot> = {}): StoredPilot {
  const now = '2026-08-02T12:00:00.000Z'
  return {
    id: 'pilot-1',
    profileId: 'profile-1',
    initialSubmissionId: 'submission-1',
    state: 'scope_confirmed',
    route: 'zero-call',
    answers: pilotAnswers,
    exceptions: [],
    unresolved: [],
    proposal: buildCommercialSnapshot(pilotAnswers as never, [], {
      startDate: '2026-08-10',
    }),
    successCriteria: buildSuccessCriteria(pilotAnswers as never),
    securityDecisions: buildSecurityDecisions(pilotAnswers as never),
    history: [{at: now, action: 'created', state: 'reviewing'}],
    signing: {},
    payment: {},
    kickoff: {},
    resolvedStartDate: '2026-08-10',
    reviewers: [],
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

test('the pilot plan document renders as a two-page record', async () => {
  const plan = await renderToBuffer(PilotPlanPdfDocument({pilot: storedPilot(), generatedAt: '2026-08-02T12:00:00.000Z'}))

  assert.equal(plan.subarray(0, 4).toString(), '%PDF')
  assert.ok(plan.length > 1_000)
  assert.equal(plan.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length, 2)
})

test('the pilot plan record includes the signed identity once signed', async () => {
  const signed = storedPilot({
    state: 'signed',
    signing: {
      name: 'Ava Nguyen',
      email: 'ava@studio.example',
      signedAt: '2026-08-04T12:00:00.000Z',
      consented: true,
    },
  })
  const plan = await renderToBuffer(PilotPlanPdfDocument({pilot: signed, generatedAt: '2026-08-04T12:00:00.000Z'}))

  assert.equal(plan.subarray(0, 4).toString(), '%PDF')
  assert.equal(plan.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length, 2)
})

test('a one-call pilot plan with exceptions stays a two-page record', async () => {
  const oneCall = storedPilot({
    route: 'one-call',
    exceptions: [
      {
        kind: 'custom-integration',
        summary: 'Custom integration or portals engineering work is outside the standard scope.',
        amendment: 'Separately priced amendment or technical review before scope confirmation.',
      },
    ],
  })
  const plan = await renderToBuffer(PilotPlanPdfDocument({pilot: oneCall, generatedAt: '2026-08-02T12:00:00.000Z'}))

  assert.equal(plan.subarray(0, 4).toString(), '%PDF')
  assert.equal(plan.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length, 2)
})
