import {z} from 'zod'

export const DISCLOSURE_VERSION = '2026-08-01'
export const SCORE_VERSION = '2026-08-09.v2'

export const leadSubmissionTypes = [
  'guide_download',
  'security_download',
  'pilot_brief_download',
  'assessment',
  'commercial_readiness',
  'workflow_review',
  'pilot_request',
  'contact',
  'commercial_event',
] as const

export type LeadSubmissionType = (typeof leadSubmissionTypes)[number]

const optionalText = (maximum: number) =>
  z.string().trim().max(maximum).optional().default('')

export const identitySchema = z.object({
  email: z.string().trim().email().max(254).optional(),
  name: z.string().trim().min(1).max(160).optional(),
  company: z.string().trim().min(1).max(160).optional(),
  role: z.string().trim().min(1).max(120).optional(),
  website: optionalText(300),
})

export type LeadIdentity = z.infer<typeof identitySchema>

export const attributionSchema = z.object({
  sourcePage: z.string().trim().min(1).max(500),
  ctaLabel: optionalText(160),
  intent: optionalText(80),
  useCase: optionalText(120),
  referrer: optionalText(500),
  utmSource: optionalText(160),
  utmMedium: optionalText(160),
  utmCampaign: optionalText(160),
  utmContent: optionalText(160),
  utmTerm: optionalText(160),
  clientIp: optionalText(64),
  os: optionalText(80),
})

export type LeadAttribution = z.infer<typeof attributionSchema>

export const consentSchema = z.object({
  disclosureVersion: z.literal(DISCLOSURE_VERSION),
  marketing: z.boolean().default(false),
  analytics: z.boolean().default(false),
})

const commonSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(180),
  formVersion: z.string().trim().min(1).max(80),
  provider: z
    .enum(['browser', 'attio'])
    .default('browser'),
  identity: identitySchema.optional(),
  attribution: attributionSchema,
  consent: consentSchema,
  companyFax: z.string().max(200).optional().default(''),
  anonAnalyticsId: z.string().trim().max(64).optional(),
})

const resourceAnswersSchema = z.object({
  interest: z.string().trim().min(1).max(160),
  message: optionalText(2000),
})

export const assessmentAnswersSchema = z.object({
  teamType: optionalText(80),
  teamSize: optionalText(40),
  workflowCollaborators: optionalText(40),
  toolsUsed: optionalText(40),
  approvedVersionMethod: optionalText(80),
  productionContextMethod: optionalText(80),
  recreationFrequency: optionalText(40),
  incidentType: optionalText(80),
  incidentDescription: optionalText(2000),
  peopleAffected: optionalText(40),
  hoursLost: optionalText(40),
  deliveryImpact: optionalText(80),
  recurringWorkflow: optionalText(40),
  assetVolume: optionalText(40),
  annualAffectedValue: optionalText(40),
  activeWorkflow: optionalText(2000),
  pricingOrPilotViewed: z.boolean().optional(),
  securityDiligence: z.boolean().optional(),
  message: optionalText(3000),
})

export const workflowReviewAnswersSchema = z.object({
  activeWorkflow: optionalText(2000),
  timeline: optionalText(80),
  currentSystems: optionalText(1200),
  unresolvedQuestion: optionalText(2000),
  stakeholderInvolved: z.boolean().optional(),
  securityDiligence: z.boolean().optional(),
})

export const commercialReadinessAnswersSchema = z.object({
  targetStartPeriod: z.enum(['within-30-days', 'within-60-days', 'this-quarter', 'later']),
  approvalPath: z.enum(['self', 'other', 'procurement', 'not-established', 'no']),
  productionOwner: z.string().trim().min(1).max(300),
  primaryObjection: z.enum([
    'none',
    'workflow-fit',
    'value',
    'pilot-scope',
    'security',
    'integration',
    'procurement',
    'timing-budget',
    'stakeholder-alignment',
    'other',
  ]),
  objectionDetail: optionalText(2000),
})

export const pilotControlledOptionLists = {
  historicalProject: ['one-completed', 'none', 'more-than-one'],
  integrationMethod: [
    'manual-upload',
    'cloud-storage-import',
    'api-based',
    'custom-integration',
    'not-yet-known',
  ],
  dataClassification: [
    'public',
    'confidential',
    'unreleased-client',
    'personal',
    'regulated',
    'not-sure',
  ],
  successCriterionKeys: [
    'approved-retrieval',
    'production-context',
    'reproduction',
    'meaningful-extension',
    'knowledge-transfer',
    'variant-lineage',
    'continuity',
    'other',
  ],
  participantsRange: ['1', '2-4', '5', '6-10', '11-plus'],
  approvalPath: ['self', 'other', 'procurement', 'not-established', 'no'],
  annualDeploymentOption: ['studio', 'production-team', 'enterprise', 'not-known'],
  integrationMethodLabel: {
    'manual-upload': 'Manual structured upload',
    'cloud-storage-import': 'Supported cloud-storage import',
    'api-based': 'API-based import',
    'custom-integration': 'Custom integration',
    'not-yet-known': 'Not yet known',
  },
  dataClassificationLabel: {
    public: 'Public',
    confidential: 'Confidential commercial',
    'unreleased-client': 'Unreleased client work',
    personal: 'Personal data',
    regulated: 'Regulated data',
    'not-sure': 'Not sure',
  },
  successCriterionLabel: {
    'approved-retrieval': 'Approved asset retrieval',
    'production-context': 'Production-context recovery',
    reproduction: 'Reproduction',
    'meaningful-extension': 'Meaningful extension',
    'knowledge-transfer': 'Knowledge transfer',
    'variant-lineage': 'Variant-lineage control',
    continuity: 'Continuity preservation',
    other: 'Other (describe)',
  },
} as const

const controlledChoice = <T extends readonly string[]>(options: T) =>
  z.enum(options).optional().default('')

export const pilotControlledFields = {
  historicalProject: controlledChoice(pilotControlledOptionLists.historicalProject),
  historicalProjectName: optionalText(300),
  integrationMethod: controlledChoice(pilotControlledOptionLists.integrationMethod),
  integrationSystemsJson: optionalText(6000),
  dataClassification: controlledChoice(pilotControlledOptionLists.dataClassification),
  successCriterionKeysJson: optionalText(600),
  participantsRange: controlledChoice(pilotControlledOptionLists.participantsRange),
  approvalPath: controlledChoice(pilotControlledOptionLists.approvalPath),
  approverName: optionalText(160),
  approverRole: optionalText(160),
  approverEmail: optionalText(254),
  economicBuyerEmail: optionalText(254),
  technicalEvaluatorEmail: optionalText(254),
  procurementPoRequired: z.boolean().optional(),
  procurementReviewTime: optionalText(120),
  annualDeploymentOption: controlledChoice(pilotControlledOptionLists.annualDeploymentOption),
  annualPriceAcknowledged: z.boolean().optional(),
  signerName: optionalText(160),
  signerEmail: optionalText(254),
  exactReproductionRequired: z.boolean().optional(),
  pilotBlocker: optionalText(600),
}

export type PilotControlledAnswers = Partial<
  z.infer<z.ZodObject<typeof pilotControlledFields>>
>

export type PilotAnswers = Partial<z.infer<typeof pilotRequestAnswersSchema>>

export type IntegrationRow = {
  name: string
  purpose: string
  dataIn: string
  dataOut: string
  method: 'standard-connector' | 'api' | 'manual-import' | 'unknown'
  credentialsRequired: boolean
  portalsEngineering: boolean
  mustHave: 'must-have' | 'optional'
  confirmedSupported: boolean
}

export type SuccessCriterion = {
  key: string
  label: string
  status: 'accepted' | 'modified' | 'not-applicable'
  target?: string
  participant?: string
  evidence?: string
}

export type SecurityDecision = {
  key: string
  label: string
  decision: 'confirm' | 'exception' | 'accept' | 'not-applicable'
  note?: string
}

export const pilotRequestAnswersSchema = assessmentAnswersSchema.extend({
  assessmentOrigin: z.enum(['standard', 'assessment_override']).optional().default('standard'),
  pilotWorkflow: optionalText(2000),
  productionOwner: optionalText(300),
  economicBuyer: optionalText(300),
  technicalEvaluator: optionalText(300),
  requiredIntegrations: optionalText(1200),
  targetStartPeriod: optionalText(120),
  successCriteria: optionalText(2000),
  securityRequirements: optionalText(2000),
  budgetReadiness: optionalText(120),
  budgetOwner: optionalText(160),
  message: optionalText(3000),
  ...pilotControlledFields,
})

export const pilotRequiredAnswerFields = [
  'pilotWorkflow',
  'productionOwner',
  'economicBuyer',
  'technicalEvaluator',
  'requiredIntegrations',
  'targetStartPeriod',
  'successCriteria',
  'securityRequirements',
  'budgetReadiness',
  'budgetOwner',
] as const

const contactAnswersSchema = z.object({
  question: z.string().trim().min(1).max(3000),
  interest: optionalText(160),
})

export const commercialEventNames = [
  'meeting_booked',
  'pilot_proposed',
  'pilot_accepted',
  'annual_contract_sent',
  'annual_contract_won',
] as const

const commercialEventAnswersSchema = z.object({
  event: z.enum(commercialEventNames),
  attioRecordId: optionalText(160),
  revenueAmount: z.number().nonnegative().max(100_000_000).optional(),
  currency: z.string().trim().length(3).default('USD'),
  occurredAt: z.string().datetime().optional(),
})

export const leadRequestSchema = z.discriminatedUnion('submissionType', [
  commonSchema.extend({
    submissionType: z.enum([
      'guide_download',
      'security_download',
      'pilot_brief_download',
    ]),
    answers: resourceAnswersSchema,
  }),
  commonSchema.extend({
    submissionType: z.literal('assessment'),
    answers: assessmentAnswersSchema,
  }),
  commonSchema.extend({
    submissionType: z.literal('commercial_readiness'),
    answers: commercialReadinessAnswersSchema,
  }),
  commonSchema.extend({
    submissionType: z.literal('workflow_review'),
    answers: workflowReviewAnswersSchema,
  }),
  commonSchema.extend({
    submissionType: z.literal('pilot_request'),
    pilotId: optionalText(80),
    answers: pilotRequestAnswersSchema,
  }),
  commonSchema.extend({
    submissionType: z.literal('contact'),
    answers: contactAnswersSchema,
  }),
  commonSchema.extend({
    submissionType: z.literal('commercial_event'),
    provider: z.literal('attio'),
    answers: commercialEventAnswersSchema,
  }),
])

export const profileResetSchema = z.object({
  action: z.literal('reset_profile'),
})

export type LeadRequest = z.infer<typeof leadRequestSchema>

export type ScoreDimension = {
  earned: number
  answeredMaximum: number
  eligibleMaximum: number
  normalized: number
  coverage: number
}

export type QualificationScores = {
  version: typeof SCORE_VERSION
  fit: ScoreDimension
  pain: ScoreDimension
  intent: ScoreDimension
  assessmentScore: number
  workflowRiskScore: number
}

export type QualificationTier = 'high' | 'medium' | 'low' | 'incomplete'
export type QualificationOutcome = 'pilot_candidate' | 'clarify' | 'education'
export type QualificationReasonCode =
  | 'strong-workflow-fit'
  | 'repeatable-production'
  | 'measurable-rework-risk'
  | 'production-context-fragmented'
  | 'approved-version-risk'
  | 'commercial-readiness-needed'
  | 'workflow-definition-needed'
  | 'limited-current-risk'
export type LeadNextAction =
  | 'download'
  | 'pilot_scope'
  | 'pilot_room'
  | 'assessment_review'
  | 'commercial_clarification'
  | 'use_case'
  | 'calendar'
  | 'follow_up'

export type LeadResponse = {
  ok: true
  nextAction: LeadNextAction
  provisional?: boolean
  downloadUrl?: string
  calendarUrl?: string
  pilotUrl?: string
  pilotState?: string
  pilotRoute?: string
  qualificationTier?: QualificationTier
  scores?: QualificationScores
  qualificationOutcome?: QualificationOutcome
  reasonCodes?: QualificationReasonCode[]
  missingFields?: string[]
  workflowRiskScore?: number
  recommendedWorkflow?: string
  message?: string
  analyticsPersonId?: string
  dryRun?: boolean
}

export type KnownLeadContext = {
  known: boolean
  knownFields: Array<'email' | 'name' | 'company' | 'role' | 'website'>
  knownAnswerFields: string[]
  answerValues?: Record<string, unknown>
  requiresWebsite?: boolean
  scores?: QualificationScores
  qualificationTier?: QualificationTier
  qualificationOutcome?: QualificationOutcome
  reasonCodes?: QualificationReasonCode[]
  missingFields?: string[]
  assessmentCompleted?: boolean
  recommendedWorkflow?: string
  incidentFollowUpEligible?: boolean
}
