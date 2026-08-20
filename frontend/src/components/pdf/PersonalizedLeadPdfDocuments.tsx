import React, { type ReactElement } from 'react'
import path from 'node:path'
import {
  Document,
  type DocumentProps,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer'
import type {
  LeadIdentity,
  QualificationScores,
  QualificationTier,
  QualificationReasonCode,
  QualificationOutcome,
} from '@/lib/leads/contracts'
import { pilotControlledOptionLists } from '@/lib/leads/contracts'
import { stateLabel } from '@/lib/leads/pilot'
import type { StoredPilot } from '@/lib/leads/store'
import type { ResourceDocument } from '@/types/resource'
import {
  PACKAGE_SPEC_SLUGS,
  findPackageSpecification,
  packageMilestoneLabel,
  packagePriceLabel,
  packageLimitLabel,
} from '@/lib/package-specifications'
import { formatReadableDate } from '@/lib/utils'
import { buildValueModel, type ValueModel } from '@/lib/leads/pilot'
import { productionWorkflows } from '@/lib/production-workflows'

const HEADING_SIZE = 22
const SUB_HEADING_SIZE = 16
const NORMAL_SIZE = 10.5
const SMALL_SIZE = 9
const FONT_ROOT = path.resolve(process.cwd(), 'public/fonts/pdf')

Font.register({
  family: 'DieGroteskB',
  fonts: [
    { src: path.join(FONT_ROOT, 'DieGroteskB-Regular.ttf'), fontWeight: 400 },
    { src: path.join(FONT_ROOT, 'DieGroteskB-Medium.ttf'), fontWeight: 500 },
  ],
})
Font.register({
  family: 'DieGroteskC',
  fonts: [
    { src: path.join(FONT_ROOT, 'DieGroteskC-Light.ttf'), fontWeight: 300 },
  ],
})
Font.registerHyphenationCallback((word) => [word])

const colors = {
  ink: '#07112C',
  blue: '#2F66B5',
  lightBlue: '#79C7DA',
  pale: '#EAF6FA',
  white: '#FFFFFF',
  muted: '#52617D',
  border: '#E5EBF4',
  green: '#1E8A49',
  amber: '#C47A00',
  red: '#C0392B',
  cardDark: '#17264A',
  cardLight: '#F0F5FA',
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 42,
    paddingRight: 44,
    paddingBottom: 40,
    paddingLeft: 44,
    backgroundColor: colors.white,
    color: colors.ink,
    fontFamily: 'DieGroteskB',
    fontSize: NORMAL_SIZE,
    lineHeight: 1.2,
  },
  cover: { backgroundColor: colors.ink, color: colors.white },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  wordmark: { width: 80, fontWeight: 500 },
  heading: {
    fontFamily: 'DieGroteskC',
    fontSize: HEADING_SIZE,
    fontWeight: 300,
    lineHeight: 1.04,
  },
  subHeading: {
    fontFamily: 'DieGroteskC',
    fontSize: SUB_HEADING_SIZE,
    fontWeight: 300,
    lineHeight: 1.1,
  },
  body: { marginTop: 8 },
  muted: { marginTop: 6, color: colors.muted },
  coverMuted: { marginTop: 8, color: colors.lightBlue },
  section: { marginTop: 20 },
  sectionTitle: {
    marginBottom: 8,
    fontFamily: 'DieGroteskC',
    fontSize: HEADING_SIZE,
    fontWeight: 300,
    lineHeight: 1.04,
  },
  sectionTitleSmall: {
    marginBottom: 6,
    fontFamily: 'DieGroteskC',
    fontSize: SUB_HEADING_SIZE,
    fontWeight: 300,
    lineHeight: 1.1,
  },
  columns: { flexDirection: 'row', gap: 24 },
  column: { width: 250 },
  item: { marginBottom: 8 },
  label: { fontWeight: 500 },
  panel: { marginTop: 18, padding: 14, backgroundColor: colors.cardDark, color: colors.white },
  darkPanel: {
    marginTop: 18,
    padding: 14,
    backgroundColor: colors.ink,
    color: colors.white,
  },
  lightPanel: {
    marginTop: 18,
    padding: 14,
    backgroundColor: colors.cardLight,
  },
  footer: {
    position: 'absolute',
    left: 44,
    right: 44,
    bottom: 20,
    color: colors.muted,
    fontSize: SMALL_SIZE,
  },
  criterionRow: {
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 5,
  },
  sigLine: {
    marginTop: 22,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.ink,
  },
  tierBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 3,
    fontWeight: 500,
    fontSize: SMALL_SIZE,
  },
  reportTitle: {
    fontFamily: 'DieGroteskC',
    fontSize: 30,
    fontWeight: 300,
    lineHeight: 1.02,
    maxWidth: 430,
  },
  reportLead: {
    marginTop: 12,
    maxWidth: 430,
    fontFamily: 'DieGroteskC',
    fontSize: 13.5,
    fontWeight: 300,
    lineHeight: 1.3,
    color: colors.muted,
  },
  kicker: {
    marginBottom: 10,
    fontSize: 8,
    fontWeight: 500,
    letterSpacing: 1.4,
    color: colors.blue,
    textTransform: 'uppercase',
  },
  coverTitle: {
    marginTop: 52,
    maxWidth: 500,
    fontFamily: 'DieGroteskC',
    fontSize: 36,
    fontWeight: 300,
    lineHeight: 0.98,
  },
  coverCompany: {
    marginTop: 16,
    fontSize: 14,
    color: colors.lightBlue,
  },
  coverRoi: { marginTop: 54, maxWidth: 430 },
  coverRoiValue: {
    fontFamily: 'DieGroteskC',
    fontSize: 34,
    fontWeight: 300,
    lineHeight: 1,
    color: colors.white,
  },
  coverRoiLabel: {
    marginTop: 8,
    maxWidth: 390,
    fontSize: 11,
    lineHeight: 1.35,
    color: colors.lightBlue,
  },
  coverRule: {
    marginTop: 26,
    borderBottomWidth: 1,
    borderBottomColor: '#344260',
  },
  coverSummary: {
    marginTop: 24,
    flexDirection: 'row',
    gap: 28,
  },
  coverSummaryItem: { width: 145 },
  coverSummaryValue: {
    fontFamily: 'DieGroteskC',
    fontSize: 17,
    fontWeight: 300,
    color: colors.white,
  },
  coverSummaryLabel: { marginTop: 5, fontSize: 8.5, color: colors.lightBlue },
  reportSection: { marginTop: 23 },
  split: { flexDirection: 'row', gap: 36 },
  mainPane: { width: 336 },
  rightRail: { width: 132, paddingTop: 2 },
  railItem: { marginBottom: 22 },
  railValue: {
    fontFamily: 'DieGroteskC',
    fontSize: 18,
    fontWeight: 300,
    lineHeight: 1.05,
    color: colors.ink,
  },
  railLabel: { marginTop: 5, fontSize: 8.5, lineHeight: 1.3, color: colors.muted },
  equation: {
    marginTop: 18,
    paddingVertical: 18,
    paddingHorizontal: 18,
    backgroundColor: colors.pale,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  equationFactor: { width: 72 },
  equationValue: {
    fontFamily: 'DieGroteskC',
    fontSize: 17,
    fontWeight: 300,
    color: colors.blue,
  },
  equationLabel: { marginTop: 4, fontSize: 7.5, lineHeight: 1.25, color: colors.muted },
  equationOperator: { width: 10, fontSize: 14, color: colors.blue, textAlign: 'center' },
  valueRange: { marginTop: 20 },
  valueRangeNumber: {
    fontFamily: 'DieGroteskC',
    fontSize: 27,
    fontWeight: 300,
    lineHeight: 1.12,
    color: colors.blue,
  },
  valueRangeLabel: { marginTop: 9, color: colors.muted },
  scenarioRow: {
    flexDirection: 'row',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  scenarioPercent: { width: 66, fontWeight: 500, color: colors.blue },
  scenarioHours: { width: 112 },
  scenarioValue: { flex: 1, textAlign: 'right', fontWeight: 500 },
  workflowCard: {
    marginTop: 18,
    padding: 19,
    backgroundColor: colors.cardLight,
    borderRadius: 2,
  },
  workflowCardTitle: {
    fontFamily: 'DieGroteskC',
    fontSize: 19,
    fontWeight: 300,
    lineHeight: 1.05,
  },
  workflowCardBody: { marginTop: 11, fontSize: 10, lineHeight: 1.32 },
  workflowCardOutcome: { marginTop: 9, fontSize: 10, lineHeight: 1.32, color: colors.blue },
  evidenceRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 14,
  },
  evidenceSignal: { width: 112, fontWeight: 500 },
  evidenceMeaning: { width: 166, color: colors.muted },
  evidenceResponse: { flex: 1, color: colors.blue },
  outcomeGrid: { marginTop: 18, flexDirection: 'row', gap: 16 },
  outcomeItem: { width: 116 },
  outcomeTitle: { fontWeight: 500, color: colors.blue },
  outcomeBody: { marginTop: 6, fontSize: 8.5, lineHeight: 1.3, color: colors.muted },
  pilotHero: {
    marginTop: 22,
    paddingVertical: 18,
    paddingHorizontal: 18,
    backgroundColor: colors.ink,
    color: colors.white,
    flexDirection: 'row',
    gap: 22,
  },
  pilotHeroItem: { flex: 1 },
  pilotHeroValue: {
    fontFamily: 'DieGroteskC',
    fontSize: 19,
    fontWeight: 300,
    color: colors.white,
  },
  pilotHeroLabel: { marginTop: 5, fontSize: 8.5, lineHeight: 1.25, color: colors.lightBlue },
  cleanListItem: { flexDirection: 'row', marginBottom: 9, gap: 9 },
  cleanListIndex: { width: 16, fontSize: 8, fontWeight: 500, color: colors.blue },
  cleanListText: { flex: 1, fontSize: 9.5, lineHeight: 1.3 },
  measureHeader: {
    flexDirection: 'row',
    paddingBottom: 7,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink,
  },
  measureRow: {
    flexDirection: 'row',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  measureName: { width: 145, paddingRight: 10 },
  measureTarget: { width: 150, paddingRight: 10, color: colors.blue },
  measureEvidence: { flex: 1, color: colors.muted },
  scoreRow: { marginBottom: 17 },
  scoreLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  scoreTrack: { height: 5, backgroundColor: colors.cardLight },
  scoreFill: { height: 5, backgroundColor: colors.blue },
  profileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  profileItem: { width: 150, marginBottom: 8 },
  profileLabel: { marginBottom: 4, fontSize: 8, color: colors.muted },
  profileValue: { fontSize: 10, lineHeight: 1.25 },
  decisionBlock: { marginTop: 20, padding: 18, backgroundColor: colors.pale },
  decisionAsk: {
    fontFamily: 'DieGroteskC',
    fontSize: 19,
    fontWeight: 300,
    lineHeight: 1.12,
    color: colors.blue,
  },
})

// ============================================================================
// Type Definitions
// ============================================================================

export type PersonalizedQualification = {
  identity: LeadIdentity
  answers: Record<string, unknown>
  scores: QualificationScores
  tier: QualificationTier
  recommendedWorkflow: string
  generatedAt: string
  reasonCodes?: QualificationReasonCode[]
}

export const ASSESSMENT_PDF_FILE_NAME = 'portals-production-workflow-evaluation.pdf'

// ============================================================================
// Helper Functions
// ============================================================================

const workflowLabels: Record<string, string> = {
  'approved-version-retrieval': 'Approved Version Retrieval',
  'asset-reproduction': 'Asset Reproduction',
  'character-continuity': 'Character Continuity',
  'campaign-variant-control': 'Campaign Variant Control',
  'production-handoff': 'Production Handoff',
  'twelve-more-like-this': 'Twelve More Like This',
}

const tierLabels: Record<QualificationTier, string> = {
  high: 'High — Strong Pilot Candidate',
  medium: 'Medium — Needs Clarification',
  low: 'Low — Educational Path',
  incomplete: 'Incomplete — More Data Needed',
}

const outcomeLabels: Record<QualificationOutcome, string> = {
  pilot_candidate: 'Pilot Candidate',
  clarify: 'Clarify & Deepen',
  education: 'Education First',
}

const reasonCodeLabels: Record<QualificationReasonCode, string> = {
  'strong-workflow-fit': 'Strong workflow fit for portals',
  'repeatable-production': 'Repeatable production workflow',
  'measurable-rework-risk': 'Measurable rework risk',
  'production-context-fragmented': 'Production context is fragmented',
  'approved-version-risk': 'Approved version tracking is risky',
  'commercial-readiness-needed': 'Commercial readiness needed',
  'workflow-definition-needed': 'Workflow definition needed',
  'limited-current-risk': 'Limited current risk',
}

const tierBadgeColors: Record<QualificationTier, { bg: string; text: string }> = {
  high: { bg: '#D4EDDA', text: colors.green },
  medium: { bg: '#FFF3CD', text: colors.amber },
  low: { bg: '#F8D7DA', text: colors.red },
  incomplete: { bg: '#E2E3E5', text: colors.muted },
}

function answer(data: PersonalizedQualification, key: string): string {
  const value = data.answers[key]
  return typeof value === 'string' ? value : ''
}

function readable(value: string): string {
  return value
    ? value.replace(/(\d)-(\d)/g, '$1–$2').replaceAll('-', ' ')
    : 'not provided'
}

function clipped(value: string, maximum: number): string {
  if (value.length <= maximum) return value
  const excerpt = value.slice(0, maximum - 3)
  const wordBoundary = excerpt.lastIndexOf(' ')
  return `${excerpt.slice(0, wordBoundary > maximum * 0.7 ? wordBoundary : undefined).trim()}...`
}

function briefAnswer(data: PersonalizedQualification, key: string, maximum: number): string {
  return clipped(answer(data, key), maximum)
}

function formatHours(hours: number | undefined): string {
  if (hours === undefined) return 'baseline in pilot'
  return hours.toLocaleString('en-US')
}

function formatCurrencyValue(value: number | undefined): string {
  if (value === undefined) return 'baseline in pilot'
  return `$${value.toLocaleString('en-US')}`
}

function formatRange(low: number, high: number, formatter: (value: number) => string): string {
  return low === high ? formatter(low) : `${formatter(low)}–${formatter(high)}`
}

function valueModelHours(model: ValueModel | undefined): string {
  return model ? formatRange(model.low, model.high, (value) => value.toLocaleString('en-US')) : 'baseline in pilot'
}

function valueModelCost(model: ValueModel | undefined, rate = 100): string {
  return model
    ? formatRange(model.low * rate, model.high * rate, (value) => `$${value.toLocaleString('en-US')}`)
    : 'baseline in pilot'
}

function getValueModel(data: PersonalizedQualification): ValueModel | undefined {
  return buildValueModel(
    answer(data, 'recreationFrequency'),
    answer(data, 'hoursLost'),
    answer(data, 'peopleAffected')
  )
}

function getTierBadgeStyle(tier: QualificationTier) {
  return tierBadgeColors[tier] || tierBadgeColors.incomplete
}

function mapWorkflowToPortals(workflow: string): string {
  return workflowLabels[workflow] || readable(workflow)
}

function getRecommendedWorkflowLabel(data: PersonalizedQualification): string {
  return mapWorkflowToPortals(data.recommendedWorkflow)
}

function getReasonCodeLabels(codes: QualificationReasonCode[]): string[] {
  return codes.map((code) => reasonCodeLabels[code] || code)
}

function getPilotSpec(document?: ResourceDocument) {
  return findPackageSpecification(document?.packageSpecifications, PACKAGE_SPEC_SLUGS.paidPilot)
}

function Header({ title, page }: { title: string; page?: number }) {
  return (
    <View style={styles.header}>
      <Text style={styles.wordmark}>portals</Text>
      <Text style={{ flex: 1, textAlign: 'right' }}>{page ? `${title} / ${page}` : title}</Text>
    </View>
  )
}

// ============================================================================
// Assessment report components
// ============================================================================

const annualAffectedValueLabels: Record<string, string> = {
  'under-10k': 'under $10K',
  '10k-49k': '$10K–$49K',
  '50k-99k': '$50K–$99K',
  '100k-499k': '$100K–$499K',
  '500k-plus': '$500K+',
}

function assessmentOutcome(tier: QualificationTier): QualificationOutcome {
  if (tier === 'high') return 'pilot_candidate'
  if (tier === 'medium' || tier === 'incomplete') return 'clarify'
  return 'education'
}

function companyName(data: PersonalizedQualification): string {
  return data.identity.company || 'your organization'
}

function companyDisplay(data: PersonalizedQualification, maximum = 64): string {
  return clipped(companyName(data), maximum)
}

function preparedFor(data: PersonalizedQualification): string {
  const contact = [data.identity.name, data.identity.role && readable(data.identity.role)]
    .filter(Boolean)
    .join(' · ')
  return clipped(contact || 'production leadership', 80)
}

function recommendedWorkflow(data: PersonalizedQualification) {
  const workflowId = data.recommendedWorkflow === 'twelve-more-like-this'
    ? 'five-more-like-this'
    : data.recommendedWorkflow
  return productionWorkflows.find((workflow) => workflow.id === workflowId)
    || productionWorkflows.find((workflow) => workflow.id === 'asset-reproduction')!
}

function recommendationStatement(data: PersonalizedQualification): string {
  switch (assessmentOutcome(data.tier)) {
    case 'pilot_candidate':
      return 'Proceed to a bounded paid pilot on one active workflow. Measure reclaimed time, retrieval speed, handoff quality, and delivery confidence before any wider deployment.'
    case 'clarify':
      return 'Complete the ownership, timing, and approval details, then use the same bounded pilot structure to validate value on one active workflow.'
    default:
      return 'Establish a workflow baseline first. Revisit a paid pilot when the team can name a repeatable workflow and measurable production-memory cost.'
  }
}

function TierBadge({ tier }: { tier: QualificationTier }) {
  const { bg, text } = getTierBadgeStyle(tier)
  return (
    <View style={[styles.tierBadge, { backgroundColor: bg, alignSelf: 'flex-start' }]}>
      <Text style={{ color: text }}>{tierLabels[tier]}</Text>
    </View>
  )
}

function ReportHeader({ page }: { page: number }) {
  return <Header title={`your production workflow evaluation · ${page} / 5`} />
}

function Kicker({ children }: { children: React.ReactNode }) {
  return <Text style={styles.kicker}>{children}</Text>
}

function CleanList({ items }: { items: string[] }) {
  return (
    <View>
      {items.map((item, index) => (
        <View key={item} style={styles.cleanListItem} wrap={false}>
          <Text style={styles.cleanListIndex}>{String(index + 1).padStart(2, '0')}</Text>
          <Text style={styles.cleanListText}>{item}</Text>
        </View>
      ))}
    </View>
  )
}

function RailMetric({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.railItem} wrap={false}>
      <Text style={styles.railValue}>{value}</Text>
      <Text style={styles.railLabel}>{label}</Text>
    </View>
  )
}

function ScoreBar({ label, score, coverage }: { label: string; score: number; coverage: number }) {
  return (
    <View style={styles.scoreRow} wrap={false}>
      <View style={styles.scoreLabelRow}>
        <Text style={{ fontWeight: 500 }}>{label}</Text>
        <Text>{score}% · {coverage}% response coverage</Text>
      </View>
      <View style={styles.scoreTrack}>
        <View style={[styles.scoreFill, { width: `${Math.max(0, Math.min(100, score))}%` }]} />
      </View>
    </View>
  )
}

function ProfileItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.profileItem} wrap={false}>
      <Text style={styles.profileLabel}>{label}</Text>
      <Text style={styles.profileValue}>{value}</Text>
    </View>
  )
}

function WorkflowCard({ data }: { data: PersonalizedQualification }) {
  const workflow = recommendedWorkflow(data)
  return (
    <View style={styles.workflowCard} wrap={false}>
      <Text style={styles.workflowCardTitle}>{workflow.title}</Text>
      <Text style={styles.workflowCardBody}>{workflow.problem}</Text>
      <Text style={styles.workflowCardOutcome}>instead, {workflow.outcome}</Text>
    </View>
  )
}

function ReportFooter({ data, note }: { data: PersonalizedQualification; note?: string }) {
  return (
    <Text style={styles.footer} fixed>
        {note || `Prepared for ${companyDisplay(data)} from assessment responses submitted ${new Date(data.generatedAt).toLocaleDateString('en-US')}.`}
    </Text>
  )
}

function Page1ExecutiveSummary({ data }: { data: PersonalizedQualification }) {
  const model = getValueModel(data)
  const workflow = getRecommendedWorkflowLabel(data)
  const reasons = getReasonCodeLabels(data.reasonCodes || []).slice(0, 3)

  return (
    <Page size="LETTER" style={[styles.page, styles.cover]}>
      <Header title="prepared by portals" />
      <Text style={[styles.kicker, { color: colors.lightBlue, marginTop: 18 }]}>prepared for {companyDisplay(data)}</Text>
      <Text style={styles.coverTitle}>your production workflow evaluation</Text>
      <Text style={styles.coverCompany}>
        {companyDisplay(data)} · {preparedFor(data)} · {new Date(data.generatedAt).toLocaleDateString('en-US')}
      </Text>

      <View style={styles.coverRoi}>
        <Text style={styles.coverRoiValue}>{valueModelCost(model)}</Text>
        <Text style={styles.coverRoiLabel}>
          estimated annual capacity exposure at a $100 blended hourly planning rate · {valueModelHours(model)} contributor-hours
        </Text>
      </View>

      <View style={styles.coverRule} />
      <View style={styles.coverSummary}>
        <View style={styles.coverSummaryItem}>
          <Text style={styles.coverSummaryValue}>{data.scores.workflowRiskScore}/24</Text>
          <Text style={styles.coverSummaryLabel}>production-memory risk</Text>
        </View>
        <View style={styles.coverSummaryItem}>
          <Text style={styles.coverSummaryValue}>{workflow}</Text>
          <Text style={styles.coverSummaryLabel}>recommended workflow focus</Text>
        </View>
        <View style={styles.coverSummaryItem}>
          <Text style={styles.coverSummaryValue}>{outcomeLabels[assessmentOutcome(data.tier)]}</Text>
          <Text style={styles.coverSummaryLabel}>recommended decision path</Text>
        </View>
      </View>

      <View style={{ marginTop: 30 }}>
        <TierBadge tier={data.tier} />
        <Text style={{ marginTop: 16, maxWidth: 455, fontSize: 11, lineHeight: 1.35 }}>
          {recommendationStatement(data)}
        </Text>
        {reasons.length ? (
          <Text style={{ marginTop: 12, maxWidth: 455, fontSize: 8.5, lineHeight: 1.35, color: colors.lightBlue }}>
            Assessment signals: {reasons.join(' · ')}
          </Text>
        ) : null}
      </View>

      <Text style={[styles.footer, { color: colors.lightBlue }]}>
        Confidential evaluation for {companyDisplay(data)} · portals.works
      </Text>
    </Page>
  )
}

function Page2BusinessCase({ data }: { data: PersonalizedQualification }) {
  const model = getValueModel(data)
  const rate = 100
  const scenarios = model
    ? [0.25, 0.5].map((share) => ({
        share,
        hours: Math.round(model.midpoint * share),
        value: Math.round(model.midpoint * share * rate),
      }))
    : []
  const affectedValue = annualAffectedValueLabels[answer(data, 'annualAffectedValue')] || 'not provided'

  return (
    <Page size="LETTER" style={styles.page}>
      <ReportHeader page={2} />
      <Kicker>01 · quantified opportunity</Kicker>
      <Text style={styles.reportTitle}>the business case for production memory</Text>
      <Text style={styles.reportLead}>
        A planning range built from the reported frequency, time loss, and affected team size.
      </Text>

      <View style={[styles.split, styles.reportSection]}>
        <View style={styles.mainPane}>
          <Text style={styles.sectionTitleSmall}>annual exposure equation</Text>
          {model ? (
            <View style={styles.equation} wrap={false}>
              <View style={styles.equationFactor}>
                <Text style={styles.equationValue}>{model.frequency.label}</Text>
                <Text style={styles.equationLabel}>{model.frequency.annualized} incidents / year</Text>
              </View>
              <Text style={styles.equationOperator}>×</Text>
              <View style={styles.equationFactor}>
                <Text style={styles.equationValue}>{model.hoursLoss.label}</Text>
                <Text style={styles.equationLabel}>lost / incident</Text>
              </View>
              <Text style={styles.equationOperator}>×</Text>
              <View style={styles.equationFactor}>
                <Text style={styles.equationValue}>{model.people.label}</Text>
                <Text style={styles.equationLabel}>contributors affected</Text>
              </View>
            </View>
          ) : (
            <View style={styles.decisionBlock}>
              <Text style={styles.decisionAsk}>Establish the missing baseline during pilot scoping.</Text>
              <Text style={styles.muted}>Frequency, time loss, and affected contributors are all required for an auditable annual range.</Text>
            </View>
          )}

          <View style={styles.valueRange}>
            <Text style={styles.valueRangeNumber}>{valueModelHours(model)} hours / year</Text>
            <Text style={styles.valueRangeLabel}>{valueModelCost(model, rate)} gross capacity exposure at $100/hour</Text>
          </View>

          {scenarios.length ? (
            <View style={{ marginTop: 24 }}>
              <Text style={styles.sectionTitleSmall}>illustrative recovery scenarios</Text>
              {scenarios.map((scenario) => (
                <View key={scenario.share} style={styles.scenarioRow} wrap={false}>
                  <Text style={styles.scenarioPercent}>{scenario.share * 100}% recovered</Text>
                  <Text style={styles.scenarioHours}>{formatHours(scenario.hours)} hours returned</Text>
                  <Text style={styles.scenarioValue}>{formatCurrencyValue(scenario.value)} capacity value</Text>
                </View>
              ))}
              <Text style={[styles.muted, { fontSize: 8.5, lineHeight: 1.3 }]}>
                Scenarios are planning cases, not savings promises. The pilot measures the achievable reduction against a real baseline.
              </Text>
            </View>
          ) : null}

          <View style={styles.reportSection}>
            <Text style={styles.sectionTitleSmall}>where the return can compound</Text>
            <CleanList items={[
              'Budget: less paid search, reconstruction, and avoidable rework.',
              'Collaboration: one production record for employees, vendors, and approvers.',
              'Consistency: approved state, source inputs, context, and lineage stay connected.',
              'Delivery: faster handoffs with fewer preventable version or context delays.',
            ]} />
          </View>
        </View>

        <View style={styles.rightRail}>
          <Kicker>at a glance</Kicker>
          <RailMetric value={`${data.scores.workflowRiskScore}/24`} label="workflow risk score" />
          <RailMetric value={readable(answer(data, 'deliveryImpact'))} label="reported delivery impact" />
          <RailMetric value={affectedValue} label="annual value of affected work" />
          <RailMetric value={readable(answer(data, 'assetVolume'))} label="assets produced per month" />
          <RailMetric value={readable(answer(data, 'workflowCollaborators'))} label="people in the production workflow" />
        </View>
      </View>
      <ReportFooter data={data} note="Planning model: self-reported ranges · $100 blended hourly rate · validate with observed pilot data." />
    </Page>
  )
}

function Page3WorkflowDiagnosis({ data }: { data: PersonalizedQualification }) {
  const activeWorkflow = clipped(
    answer(data, 'activeWorkflow') || answer(data, 'pilotWorkflow') || 'No active workflow description was supplied.',
    200,
  )

  return (
    <Page size="LETTER" style={styles.page}>
      <ReportHeader page={3} />
      <Kicker>02 · workflow diagnosis</Kicker>
      <Text style={styles.reportTitle}>from scattered context to reusable production memory</Text>
      <Text style={styles.reportLead}>
        portals connects prompts, source files, decisions, approvals, and lineage so AI output becomes reusable production infrastructure—not a disposable final file.
      </Text>

      <View style={styles.reportSection}>
        <Text style={styles.sectionTitleSmall}>workflow nominated by {companyDisplay(data, 30)}</Text>
        <Text style={{ fontSize: 11, lineHeight: 1.35 }}>{activeWorkflow}</Text>
        <WorkflowCard data={data} />
      </View>

      <View style={styles.reportSection}>
        <Text style={styles.sectionTitleSmall}>what your answers indicate</Text>
        <View style={[styles.evidenceRow, { paddingTop: 7 }]}>
          <Text style={[styles.evidenceSignal, styles.label]}>current signal</Text>
          <Text style={[styles.evidenceMeaning, styles.label]}>production consequence</Text>
          <Text style={[styles.evidenceResponse, styles.label]}>what portals makes testable</Text>
        </View>
        <View style={styles.evidenceRow} wrap={false}>
          <Text style={styles.evidenceSignal}>{readable(answer(data, 'approvedVersionMethod'))}</Text>
          <Text style={styles.evidenceMeaning}>Approval state lives in conventions or disconnected records.</Text>
          <Text style={styles.evidenceResponse}>Canonical approved state with version history.</Text>
        </View>
        <View style={styles.evidenceRow} wrap={false}>
          <Text style={styles.evidenceSignal}>{readable(answer(data, 'productionContextMethod'))}</Text>
          <Text style={styles.evidenceMeaning}>Prompts, references, and source files are hard to recover.</Text>
          <Text style={styles.evidenceResponse}>One structured record connected to the asset.</Text>
        </View>
        <View style={styles.evidenceRow} wrap={false}>
          <Text style={styles.evidenceSignal}>{readable(answer(data, 'incidentType'))} · {readable(answer(data, 'recreationFrequency'))}</Text>
          <Text style={styles.evidenceMeaning}>The team repays for work it already completed.</Text>
          <Text style={styles.evidenceResponse}>Retrieve, reproduce, and branch from proven work.</Text>
        </View>
      </View>

      <View style={styles.reportSection}>
        <Text style={styles.sectionTitleSmall}>the operational improvement to validate</Text>
        <View style={styles.outcomeGrid}>
          <View style={styles.outcomeItem}>
            <Text style={styles.outcomeTitle}>budget</Text>
            <Text style={styles.outcomeBody}>Less search and avoidable rework.</Text>
          </View>
          <View style={styles.outcomeItem}>
            <Text style={styles.outcomeTitle}>collaboration</Text>
            <Text style={styles.outcomeBody}>A record shared across teams and vendors.</Text>
          </View>
          <View style={styles.outcomeItem}>
            <Text style={styles.outcomeTitle}>consistency</Text>
            <Text style={styles.outcomeBody}>Approved state and lineage stay connected.</Text>
          </View>
          <View style={styles.outcomeItem}>
            <Text style={styles.outcomeTitle}>delivery</Text>
            <Text style={styles.outcomeBody}>Faster retrieval and clearer handoffs.</Text>
          </View>
        </View>
      </View>
      <ReportFooter data={data} />
    </Page>
  )
}

function Page4PilotCase({ data, document }: { data: PersonalizedQualification; document?: ResourceDocument }) {
  const spec = getPilotSpec(document)
  const price = packagePriceLabel(spec)
  const period = packageMilestoneLabel(spec, 'pilot period')
  const firstValue = packageMilestoneLabel(spec, 'first value')
  const periodModifier = period.replace(/\s*days$/i, '-day')
  const participants = packageLimitLabel(spec, 'participants')
  const historicalProjects = packageLimitLabel(spec, 'historicalProjects')
  const model = getValueModel(data)
  const pilotPrice = spec?.price?.amount || 5000
  const breakEvenHours = Math.ceil(pilotPrice / 100)

  const measures = [
    ['approved retrieval', 'under 1 minute', 'timed retrieval test'],
    ['context + reuse', 'record recovered and reused once', 'record review + completed artifact'],
    ['time + handoff', 'improvement against baseline', 'time log + participant walkthrough'],
  ]

  return (
    <Page size="LETTER" style={styles.page}>
      <ReportHeader page={4} />
      <Kicker>03 · sponsor-ready validation</Kicker>
      <Text style={styles.reportTitle}>a bounded paid pilot with a clear decision gate</Text>
      <Text style={styles.reportLead}>
        Prove or disprove value on one active {getRecommendedWorkflowLabel(data).toLowerCase()} workflow before wider deployment.
      </Text>

      <View style={styles.pilotHero} wrap={false}>
        <View style={styles.pilotHeroItem}>
          <Text style={styles.pilotHeroValue}>{price}</Text>
          <Text style={styles.pilotHeroLabel}>upfront pilot fee</Text>
        </View>
        <View style={styles.pilotHeroItem}>
          <Text style={styles.pilotHeroValue}>{periodModifier}</Text>
          <Text style={styles.pilotHeroLabel}>focused evaluation window</Text>
        </View>
        <View style={styles.pilotHeroItem}>
          <Text style={styles.pilotHeroValue}>{firstValue}</Text>
          <Text style={styles.pilotHeroLabel}>to first complete production record</Text>
        </View>
        <View style={styles.pilotHeroItem}>
          <Text style={styles.pilotHeroValue}>{breakEvenHours} hrs</Text>
          <Text style={styles.pilotHeroLabel}>pilot-fee equivalent at the planning rate</Text>
        </View>
      </View>

      <View style={[styles.split, styles.reportSection]}>
        <View style={styles.mainPane}>
          <Text style={styles.sectionTitleSmall}>what the pilot includes</Text>
          <CleanList items={[
            `One active workflow: ${getRecommendedWorkflowLabel(data)}.`,
            `One active project and ${historicalProjects} historical project for comparison and continuity.`,
            `${participants} participants onboarded around the same production record.`,
            'Agreed data path, baseline, configured production record, participant validation, and final findings review.',
          ]} />
        </View>
        <View style={styles.rightRail}>
          <Kicker>value to prove</Kicker>
          <RailMetric value={valueModelHours(model)} label="annual hours currently exposed" />
          <RailMetric value={model ? `${Math.round(model.midpoint * 0.25).toLocaleString('en-US')} hrs` : 'measure first'} label="25% midpoint recovery case" />
          <RailMetric value={readable(answer(data, 'deliveryImpact'))} label="delivery risk to reduce" />
        </View>
      </View>

      <View style={styles.reportSection}>
        <Text style={styles.sectionTitleSmall}>how success will be evidenced</Text>
        <View style={styles.measureHeader}>
          <Text style={[styles.measureName, styles.label]}>measure</Text>
          <Text style={[styles.measureTarget, styles.label]}>target</Text>
          <Text style={[styles.measureEvidence, styles.label]}>evidence</Text>
        </View>
        {measures.map(([name, target, evidence]) => (
          <View key={name} style={styles.measureRow} wrap={false}>
            <Text style={styles.measureName}>{name}</Text>
            <Text style={styles.measureTarget}>{target}</Text>
            <Text style={styles.measureEvidence}>{evidence}</Text>
          </View>
        ))}
      </View>

      <ReportFooter data={data} note={`Sponsor control: scope, data access, success measures, and the decision date are confirmed before launch. ${companyDisplay(data)} may deploy, extend, or stop at the decision gate.`} />
    </Page>
  )
}

function Page5DecisionRecord({ data, document }: { data: PersonalizedQualification; document?: ResourceDocument }) {
  const spec = getPilotSpec(document)
  const price = packagePriceLabel(spec)
  const period = packageMilestoneLabel(spec, 'pilot period')
  const periodModifier = period.replace(/\s*days$/i, '-day')
  const outcome = assessmentOutcome(data.tier)
  const decisionAsk = outcome === 'pilot_candidate'
    ? `Authorize ${price} for a ${periodModifier} pilot to validate one workflow before wider deployment.`
    : outcome === 'clarify'
      ? `Authorize completion of pilot readiness; proceed with the ${price} pilot once owner, scope, and approval path are confirmed.`
      : 'Do not authorize a paid pilot yet. Establish a repeatable workflow and measurable baseline, then reassess.'
  return (
    <Page size="LETTER" style={styles.page}>
      <ReportHeader page={5} />
      <Kicker>04 · decision record</Kicker>
      <Text style={styles.reportTitle}>a manager-ready decision brief</Text>
      <Text style={styles.reportLead}>
        The recommendation, supporting evidence, and decision requested from a production sponsor.
      </Text>

      <View style={styles.decisionBlock} wrap={false}>
        <Text style={styles.kicker}>recommended sponsor decision</Text>
        <Text style={styles.decisionAsk}>{decisionAsk}</Text>
        <Text style={{ marginTop: 10, fontSize: 9.5, lineHeight: 1.35 }}>
          Why now: {valueModelCost(getValueModel(data))} in annual capacity is exposed by the reported pattern, while the pilot contains the evaluation to one workflow and a defined decision window.
        </Text>
      </View>

      <View style={[styles.split, styles.reportSection]}>
        <View style={styles.mainPane}>
          <Text style={styles.sectionTitleSmall}>assessment evidence</Text>
          <ScoreBar label="production fit" score={data.scores.fit.normalized} coverage={data.scores.fit.coverage} />
          <ScoreBar label="workflow pain" score={data.scores.pain.normalized} coverage={data.scores.pain.coverage} />
          <ScoreBar label="pilot readiness" score={data.scores.intent.normalized} coverage={data.scores.intent.coverage} />

          <View style={{ marginTop: 12 }}>
            <Text style={styles.sectionTitleSmall}>organization and workflow profile</Text>
            <View style={styles.profileGrid}>
              <ProfileItem label="team type" value={readable(answer(data, 'teamType'))} />
              <ProfileItem label="production team" value={readable(answer(data, 'teamSize'))} />
              <ProfileItem label="AI creative tools" value={readable(answer(data, 'toolsUsed'))} />
              <ProfileItem label="workflow cadence" value={readable(answer(data, 'recurringWorkflow'))} />
              <ProfileItem label="asset volume / month" value={readable(answer(data, 'assetVolume'))} />
              <ProfileItem label="latest incident" value={readable(answer(data, 'incidentType'))} />
            </View>
          </View>

        </View>

        <View style={styles.rightRail}>
          <Kicker>next actions</Kicker>
          <CleanList items={outcome === 'pilot_candidate' ? [
            'Name the production owner, economic buyer, and technical evaluator.',
            'Confirm the workflow, integrations, data classification, and success targets.',
            'Approve the pilot plan, launch, and review evidence at the final decision gate.',
          ] : outcome === 'clarify' ? [
            'Confirm the production owner and budget approval path.',
            'Set a target start and measurable workflow outcome.',
            'Build the customized pilot plan for sponsor approval.',
          ] : [
            'Select one recurring workflow.',
            'Measure retrieval, rework, and handoff time.',
            'Reassess when the value hypothesis is testable.',
          ]} />
          <Text style={[styles.profileLabel, { marginTop: 18 }]}>continue</Text>
          <Text style={{ fontSize: 10, color: colors.blue, textDecoration: 'underline' }}>portals.works/paid-pilot</Text>
          <Text style={[styles.profileLabel, { marginTop: 14 }]}>questions</Text>
          <Text style={{ fontSize: 10, color: colors.blue, textDecoration: 'underline' }}>portals.works/contact</Text>
        </View>
      </View>

      <ReportFooter
        data={data}
        note="Method: fit 40% · workflow pain 35% · pilot readiness 25%. Capacity range uses self-reported frequency, time-loss, and affected-contributor ranges. Validate all planning assumptions before purchase."
      />
    </Page>
  )
}

function pilotValueStatement(data: PersonalizedQualification): string {
  const model = getValueModel(data)
  if (model) {
    return `Based on the self-reported ranges, ${valueModelHours(model)} contributor-hours per year may be exposed to rediscovery, recreation, or avoidable production search. The pilot tests how much of that exposure can be reduced in the selected workflow.`
  }
  return 'The pilot will establish the current retrieval, recreation, and handoff baseline before measuring whether portals can reduce the exposure.'
}

// ============================================================================
// Main assessment document export
// ============================================================================

export function AssessmentResultPdfDocument({
  data,
  document,
}: {
  data: PersonalizedQualification
  document?: ResourceDocument
}): ReactElement<DocumentProps> {
  return (
    <Document
      title={`Your production workflow evaluation - ${companyName(data)}`}
      author="portals"
      subject={`Sponsor-ready production workflow evaluation for ${companyName(data)}`}
      creator="portals"
      producer="portals"
    >
      <Page1ExecutiveSummary data={data} />
      <Page2BusinessCase data={data} />
      <Page3WorkflowDiagnosis data={data} />
      <Page4PilotCase data={data} document={document} />
      <Page5DecisionRecord data={data} document={document} />
    </Document>
  )
}

// ============================================================================
// Pilot Documents (unchanged, but exported for completeness)
// ============================================================================

export function PersonalizedPilotPdfDocument({
  data,
  document,
}: {
  data: PersonalizedQualification
  document: ResourceDocument
}): ReactElement<DocumentProps> {
  const specification = findPackageSpecification(
    document.packageSpecifications,
    PACKAGE_SPEC_SLUGS.paidPilot,
  )
  const price = packagePriceLabel(specification)
  const period = packageMilestoneLabel(specification, 'pilot period')
  const firstValue = packageMilestoneLabel(specification, 'first value')
  const valueStatement = pilotValueStatement(data)
  const periodModifier = period.replace(/\s*days$/i, '-day')
  const workflow = clipped(
    answer(data, 'pilotWorkflow') || answer(data, 'activeWorkflow'),
    200,
  )

  return (
    <Document
      title={`portals paid pilot brief - ${data.identity.company}`}
      author="portals"
      subject="Draft statement of work for a paid production pilot"
      creator="portals"
      producer="portals"
    >
      <Page size="LETTER" style={[styles.page, styles.cover]}>
        <Header title="paid production pilot brief" page={1} />
        <Text style={styles.heading}>customized paid production pilot brief</Text>
        <Text style={styles.coverMuted}>
          {data.identity.company} / {period} / {price} upfront
        </Text>
        <Text style={styles.body}>
          this brief is a draft statement of work for a paid commercial evaluation. it sets out what was reported, what portals proposes, how success will be judged, and the commercial terms.
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>objective</Text>
          <Text>{workflow}</Text>
          <Text style={styles.body}>
            prove that portals can preserve and recover the complete production history of this workflow so the team can find, understand, reproduce, and extend valuable work.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>why this pilot</Text>
          <Text>
            based on the information provided, this appears to be a strong pilot candidate: the team has identified a real asset-organization problem, a stakeholder visibility need, near-term timing, and a defined production owner.
          </Text>
          <Text style={styles.body}>
            the pilot will determine whether portals can reduce ambiguity around approved assets, preserve available production context, and make the workflow easier for stakeholders to inspect and continue.
          </Text>
        </View>

        <View style={styles.columns}>
          <View style={styles.column}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>proposed scope</Text>
              <Text style={styles.item}><Text style={styles.label}>production owner:</Text> {briefAnswer(data, 'productionOwner', 52)}</Text>
              <Text style={styles.item}><Text style={styles.label}>economic buyer:</Text> {briefAnswer(data, 'economicBuyer', 52)}</Text>
              <Text style={styles.item}><Text style={styles.label}>technical evaluator:</Text> {briefAnswer(data, 'technicalEvaluator', 52)}</Text>
              <Text style={styles.item}><Text style={styles.label}>target start:</Text> {readable(answer(data, 'targetStartPeriod'))}</Text>
              <Text style={styles.item}><Text style={styles.label}>integrations:</Text> {briefAnswer(data, 'requiredIntegrations', 120)}</Text>
            </View>
          </View>
          <View style={styles.column}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>first value</Text>
              <Text>within {firstValue}, one fragmented project becomes a complete, searchable production record.</Text>
              <Text style={styles.body}>the initial record should preserve the approved asset, available versions, source context, references, decisions, approval state, and lineage.</Text>
            </View>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>success criteria</Text>
          <Text>{briefAnswer(data, 'successCriteria', 180)}</Text>
          <Text style={styles.body}>baseline criteria also include approved-asset retrieval in under one minute, production-context recovery, one meaningful reproduction or extension, knowledge transfer, and measured reduction in rediscovery or recreation.</Text>
        </View>
      </Page>

      <Page size="LETTER" style={styles.page}>
        <Header title="paid production pilot brief" page={2} />
        <View style={styles.columns}>
          <View style={styles.column}>
            <View>
              <Text style={styles.sectionTitle}>commercial terms</Text>
              <Text>the pilot fee is {price} upfront for a {periodModifier} focused commercial evaluation.</Text>
              <Text style={styles.body}>before launch, portals and the customer will agree in writing on the annual deployment scope, annual deployment price, pilot-fee credit window, final decision date, included users, included projects, and integrations. the pilot fee is credited toward the first annual deployment only if the customer signs within the agreed conversion window.</Text>
              <Text style={styles.body}><Text style={styles.label}>budget owner:</Text> executive approval required before launch</Text>
              <Text style={styles.body}><Text style={styles.label}>budget status:</Text> to be confirmed during pilot scoping</Text>
            </View>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>portals provides</Text>
              <Text>workflow alignment, pilot repository configuration, participant onboarding, agreed integration setup, active and historical project structure, pilot support, and final evaluation against the agreed criteria.</Text>
            </View>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>customer provides</Text>
              <Text>a named owner, real active and historical work, participating users, available production context, agreed system access or exports, timely feedback, and buyer participation before the final decision date.</Text>
            </View>
          </View>
          <View style={styles.column}>
            <View>
              <Text style={styles.sectionTitle}>security and implementation</Text>
              <Text>{briefAnswer(data, 'securityRequirements', 140)}</Text>
              <Text style={styles.body}>the accompanying security brief states the current architecture, policies, subprocessors, and certification status. planned certifications are unearned. </Text>
            </View>
            <View style={styles.darkPanel}>
              <Text style={styles.sectionTitle}>value to validate</Text>
              <Text>{valueStatement}</Text>
              <Text style={styles.body}>this estimate is based on self-reported ranges and is not a guaranteed savings claim or ROI forecast.</Text>
            </View>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>decision</Text>
              <Text>deploy portals, extend the pilot under a defined scope, or conclude that portals is not the right fit at this time.</Text>
            </View>
          </View>
        </View>
        <Text style={styles.footer}>draft statement of work — customized from the information supplied by {data.identity.company}. final scope and commitments require written agreement before launch.</Text>
      </Page>
    </Document>
  )
}

const integrationMethodLabel =
  pilotControlledOptionLists.integrationMethodLabel

function planAnswer(pilot: StoredPilot, key: string): string {
  const value = pilot.answers[key]
  return typeof value === 'string' ? value : ''
}

function integrationLabel(pilot: StoredPilot): string {
  const value = planAnswer(pilot, 'integrationMethod')
  return integrationMethodLabel[value as keyof typeof integrationMethodLabel] || readable(value)
}

function criterionStatusLabel(status: string): string {
  return status.replaceAll('-', ' ').replaceAll('_', ' ')
}

function planStatusLine(pilot: StoredPilot): string {
  switch (pilot.route) {
    case 'zero-call':
      return 'this pilot is within the standard package boundary — no call required.'
    case 'one-call':
      return 'this pilot includes items outside the standard scope, so a single pilot terms review is required before signing.'
    default:
      return 'this plan does not meet the standard pilot boundary as drafted and needs clarification before it can proceed.'
  }
}

export function PilotPlanPdfDocument({
  pilot,
  generatedAt,
}: {
  pilot: StoredPilot
  generatedAt: string
}): ReactElement<DocumentProps> {
  const answers = pilot.answers
  const company = String(answers.company || '')
  const workflow = clipped(
    planAnswer(pilot, 'pilotWorkflow') || planAnswer(pilot, 'activeWorkflow'),
    200,
  )
  const signerName = String(pilot.signing.name || '')
  const signedAt = pilot.signing.signedAt
    ? new Date(String(pilot.signing.signedAt)).toLocaleDateString('en-US')
    : null
  const started = formatReadableDate(pilot.resolvedStartDate || pilot.proposal?.termStart) || 'not yet chosen'

  return (
    <Document
      title={`portals paid pilot plan - ${company}`}
      author="portals"
      subject="Personalized production pilot plan and commercial record"
      creator="portals"
      producer="portals"
    >
      <Page size="LETTER" style={[styles.page, styles.cover]}>
        <Header title="pilot approval room" page={1} />
        <Text style={styles.heading}>production pilot plan</Text>
        <Text style={styles.coverMuted}>
          {company} / {stateLabel(pilot.state)} / {pilot.route.replace('-', ' ')} / {new Date(generatedAt).toLocaleDateString('en-US')}
        </Text>
        <Text style={styles.body}>{planStatusLine(pilot)}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>objective</Text>
          <Text>{workflow}</Text>
          <Text style={styles.body}>
            prove that portals can preserve and recover the complete production history of this workflow so the team can find, understand, reproduce, and extend valuable work. the first 48 hours deliver one fragmented project as a complete, searchable production record.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>proposed scope</Text>
          <View style={styles.columns}>
            <View style={styles.column}>
              <Text style={styles.item}><Text style={styles.label}>production owner:</Text> {clipped(planAnswer(pilot, 'productionOwner'), 52)}</Text>
              <Text style={styles.item}><Text style={styles.label}>economic buyer:</Text> {clipped(planAnswer(pilot, 'economicBuyer'), 52)}</Text>
              <Text style={styles.item}><Text style={styles.label}>technical evaluator:</Text> {clipped(planAnswer(pilot, 'technicalEvaluator'), 52)}</Text>
              <Text style={styles.item}><Text style={styles.label}>participants:</Text> {pilot.proposal?.participantsLabel || readable(planAnswer(pilot, 'participantsRange'))}</Text>
            </View>
            <View style={styles.column}>
              <Text style={styles.item}><Text style={styles.label}>integration:</Text> {integrationLabel(pilot)}</Text>
              <Text style={styles.item}><Text style={styles.label}>data classification:</Text> {readable(planAnswer(pilot, 'dataClassification'))}</Text>
              <Text style={styles.item}><Text style={styles.label}>pilot start:</Text> {started}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>success criteria</Text>
          {pilot.successCriteria.length ? (
            pilot.successCriteria.map((criterion) => (
              <View key={criterion.key} style={styles.criterionRow}>
                <Text style={styles.item}>
                  <Text style={styles.label}>{criterion.label} — </Text>
                  {criterionStatusLabel(criterion.status)}
                  {criterion.target ? ` · target: ${clipped(criterion.target, 90)}` : ''}
                </Text>
                <Text style={styles.muted}>
                  participant: {criterion.participant || 'assigned in the approval room'} · evidence: {criterion.evidence || 'reported in the final evaluation'}
                </Text>
              </View>
            ))
          ) : (
            <Text>the success plan is being assembled in the approval room.</Text>
          )}
        </View>
      </Page>

      <Page size="LETTER" style={styles.page}>
        <Header title="pilot approval room" page={2} />
        <View style={styles.columns}>
          <View style={styles.column}>
            <View>
              <Text style={styles.sectionTitle}>commercial terms</Text>
              {pilot.proposal ? (
                <View>
                  <Text style={styles.item}><Text style={styles.label}>pilot fee:</Text> {pilot.proposal.priceLabel}, due on signature</Text>
                  <Text style={styles.item}><Text style={styles.label}>term:</Text> {pilot.proposal.termDays} days{pilot.proposal.termStart && pilot.proposal.termEnd ? ` · ${pilot.proposal.termStart} to ${pilot.proposal.termEnd}` : ''}</Text>
                  {pilot.proposal.decisionDate ? <Text style={styles.item}><Text style={styles.label}>final decision date:</Text> {pilot.proposal.decisionDate}</Text> : null}
                  {pilot.proposal.creditDeadline ? <Text style={styles.item}><Text style={styles.label}>annual credit window:</Text> sign the annual order form by {pilot.proposal.creditDeadline}</Text> : null}
                  {pilot.proposal.annualOption ? (
                    <View>
                      <Text style={styles.item}><Text style={styles.label}>proposed annual deployment:</Text> {pilot.proposal.annualOption.name} — {pilot.proposal.annualOption.priceLabel}</Text>
                      <Text style={styles.muted}>{pilot.proposal.annualOption.creditNote}</Text>
                    </View>
                  ) : null}
                </View>
              ) : (
                <Text>commercial terms are being prepared in the approval room.</Text>
              )}
            </View>
            {pilot.proposal?.valueModel ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>auditable value estimate</Text>
                <Text>{pilot.proposal.valueModel.formula}</Text>
                <Text style={styles.body}>
                  range ${pilot.proposal.valueModel.low.toLocaleString('en-US')} – ${pilot.proposal.valueModel.high.toLocaleString('en-US')} · midpoint ${pilot.proposal.valueModel.midpoint.toLocaleString('en-US')}
                </Text>
                <Text style={styles.muted}>
                  {pilot.proposal.valueModel.frequency.label} · {pilot.proposal.valueModel.hoursLoss.label} lost · {pilot.proposal.valueModel.people.label} affected
                  {pilot.proposal.valueModel.confirmed ? ' · estimate confirmed by the customer' : ''}
                </Text>
                <Text style={styles.body}>this estimate is based on self-reported ranges and is not a guaranteed savings claim or ROI forecast.</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.column}>
            <View>
              <Text style={styles.sectionTitle}>security posture</Text>
              {pilot.securityDecisions.map((decision) => (
                <Text key={decision.key} style={styles.item}>
                  <Text style={styles.label}>{decision.label}:</Text> {decision.decision.replace('-', ' ')}
                </Text>
              ))}
              <Text style={styles.muted}>the accompanying security brief states the current architecture, policies, subprocessors, and certification status. planned certifications are unearned.</Text>
            </View>
            {pilot.exceptions.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>terms outside the standard scope</Text>
                {pilot.exceptions.map((item) => (
                  <Text key={item.kind} style={styles.item}>
                    - {item.summary}{item.resolvedAt ? ' (resolved)' : ''}
                  </Text>
                ))}
              </View>
            ) : null}
            {pilot.unresolved.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>items to resolve</Text>
                {pilot.unresolved.map((item) => (
                  <Text key={item.key} style={styles.item}>- {item.label}</Text>
                ))}
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>decision path</Text>
          <Text>deploy portals, extend the pilot under a defined scope, or conclude that portals is not the right fit at this time. the final decision date is {pilot.proposal?.decisionDate || 'stated in the room'}.</Text>
          <Text style={styles.muted}>signature and payment are completed in the pilot approval room: portals.works/paid-pilot/room/{pilot.id}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>record of agreement</Text>
          {signedAt ? (
            <Text style={styles.body}>signed by {signerName} ({String(pilot.signing.email || '')}) on {signedAt}.</Text>
          ) : (
            <Text style={styles.body}>this plan records the confirmed scope. the agreement becomes binding when the authorized signer signs in the approval room.</Text>
          )}
          {!signedAt ? (
            <View style={styles.columns}>
              <View style={styles.column}>
                <Text style={styles.sigLine}><Text style={styles.label}>authorized signer:</Text> {clipped(planAnswer(pilot, 'signerName'), 40)}</Text>
              </View>
              <View style={styles.column}>
                <Text style={styles.sigLine}><Text style={styles.label}>signer email:</Text> {clipped(planAnswer(pilot, 'signerEmail'), 40)}</Text>
              </View>
            </View>
          ) : null}
        </View>

        <Text style={styles.footer}>personalized plan record — generated from the pilot approval room on {new Date(generatedAt).toLocaleDateString('en-US')}. scope changes require a revision and re-agreement before launch.</Text>
      </Page>
    </Document>
  )
}
