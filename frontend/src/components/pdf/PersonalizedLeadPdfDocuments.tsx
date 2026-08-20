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
  wordmark: { fontWeight: 500 },
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
  metrics: { marginTop: 24, flexDirection: 'row', gap: 10 },
  metric: { width: 154, padding: 12, backgroundColor: colors.cardDark },
  lightMetric: { width: 154, padding: 12, backgroundColor: colors.pale },
  metricValue: {
    fontFamily: 'DieGroteskC',
    fontSize: HEADING_SIZE,
    fontWeight: 300,
    color: colors.lightBlue,
  },
  lightMetricValue: {
    fontFamily: 'DieGroteskC',
    fontSize: HEADING_SIZE,
    fontWeight: 300,
    color: colors.blue,
  },
  metricLabel: {
    marginTop: 4,
    fontSize: SMALL_SIZE,
    color: colors.lightBlue,
  },
  lightMetricLabel: {
    marginTop: 4,
    fontSize: SMALL_SIZE,
    color: colors.blue,
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
  // New card styles for problem-solution mapping
  card: {
    marginTop: 14,
    padding: 16,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
  },
  cardDark: {
    marginTop: 14,
    padding: 16,
    backgroundColor: colors.cardDark,
    color: colors.white,
    borderRadius: 4,
  },
  cardTitle: {
    fontWeight: 500,
    fontSize: NORMAL_SIZE,
    marginBottom: 6,
  },
  cardTitleWhite: {
    fontWeight: 500,
    fontSize: NORMAL_SIZE,
    marginBottom: 6,
    color: colors.lightBlue,
  },
  cardBody: {
    fontSize: SMALL_SIZE,
    lineHeight: 1.3,
  },
  cardBodyWhite: {
    fontSize: SMALL_SIZE,
    lineHeight: 1.3,
    color: colors.lightBlue,
  },
  tierBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 3,
    fontWeight: 500,
    fontSize: SMALL_SIZE,
  },
  roiBanner: {
    marginTop: 18,
    padding: 16,
    backgroundColor: colors.pale,
    borderLeftWidth: 4,
    borderLeftColor: colors.blue,
  },
  roiBannerText: {
    fontWeight: 500,
    color: colors.blue,
  },
  divider: {
    marginTop: 16,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  bulletList: { marginTop: 8 },
  bulletItem: {
    flexDirection: 'row',
    marginBottom: 6,
    gap: 8,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.blue,
    marginTop: 4,
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

// ============================================================================
// Helper Functions
// ============================================================================

const labels: Record<string, string> = {
  'five-more-like-this': 'twelve more like this',
  'approved-version-retrieval': 'approved-version retrieval',
  'character-continuity': 'character continuity',
  'campaign-variant-control': 'campaign variant control',
  'production-handoff': 'production handoff',
  'asset-reproduction': 'asset reproduction',
}

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
  return value ? value.replaceAll('-', ' ') : 'not provided'
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

function annualExposureHours(data: PersonalizedQualification): number | null {
  const occurrences: Record<string, number> = {
    quarterly: 4,
    monthly: 12,
    weekly: 52,
    daily: 220,
  }
  const hours: Record<string, number> = {
    'under-1-hour': 0.5,
    '1-4-hours': 2.5,
    'one-day': 8,
    '2-5-days': 28,
    'week-plus': 40,
  }
  const frequency = occurrences[answer(data, 'recreationFrequency')]
  const incidentHours = hours[answer(data, 'hoursLost')]
  if (!frequency || !incidentHours) return null
  return Math.round(frequency * incidentHours)
}

function annualExposureWithPeople(data: PersonalizedQualification): number | null {
  const baseHours = annualExposureHours(data)
  if (!baseHours) return null
  const people: Record<string, number> = {
    '1-2-people': 1.5,
    '2-5-people': 3.5,
    '6-10-people': 8,
    '11-plus-people': 15,
  }
  const multiplier = people[answer(data, 'peopleAffected')] || 1
  return Math.round(baseHours * multiplier)
}

function formatHours(hours: number | null): string {
  if (!hours) return 'Not calculated'
  return hours.toLocaleString('en-US')
}

function formatCurrency(hours: number | null, rate = 100): string {
  if (!hours) return 'Not calculated'
  return `$${(hours * rate).toLocaleString('en-US')}`
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

function getPilotSpec(document: ResourceDocument) {
  return findPackageSpecification(document.packageSpecifications, PACKAGE_SPEC_SLUGS.paidPilot)
}

function Header({ title, page }: { title: string; page?: number }) {
  return (
    <View style={styles.header}>
      <Text style={styles.wordmark}>portals</Text>
      <Text>{page ? `${title} / ${page}` : title}</Text>
    </View>
  )
}

// ============================================================================
// Reusable Components
// ============================================================================

function MetricCard({ label, value, light = false }: { label: string; value: string; light?: boolean }) {
  return (
    <View style={light ? styles.lightMetric : styles.metric}>
      <Text style={light ? styles.lightMetricValue : styles.metricValue}>{value}</Text>
      <Text style={light ? styles.lightMetricLabel : styles.metricLabel}>{label}</Text>
    </View>
  )
}

function TierBadge({ tier }: { tier: QualificationTier }) {
  const { bg, text } = getTierBadgeStyle(tier)
  return (
    <View style={[styles.tierBadge, { backgroundColor: bg }]}>
      <Text style={{ color: text }}>{tierLabels[tier]}</Text>
    </View>
  )
}

function ROIStatement({ text }: { text: string }) {
  return (
    <View style={styles.roiBanner}>
      <Text style={styles.roiBannerText}>ROI: </Text>
      <Text style={{ ...styles.roiBannerText, fontWeight: 400 }}>{text}</Text>
    </View>
  )
}

function ProblemSolutionCard({
  problem,
  solution,
  dark = false,
}: {
  problem: string
  solution: string
  dark?: boolean
}) {
  const isDark = dark
  return (
    <View style={isDark ? styles.cardDark : styles.card}>
      <Text style={isDark ? styles.cardTitleWhite : styles.cardTitle}>Problem: </Text>
      <Text style={isDark ? styles.cardBodyWhite : styles.cardBody}>{problem}</Text>
      <Text style={{ ...(isDark ? styles.cardTitleWhite : styles.cardTitle), marginTop: 8 }}>Solution: </Text>
      <Text style={isDark ? styles.cardBodyWhite : styles.cardBody}>{solution}</Text>
    </View>
  )
}

function SectionDivider() {
  return <View style={styles.divider} />
}

function BulletItem({ text }: { text: string }) {
  return (
    <View style={styles.bulletItem}>
      <View style={styles.bulletDot} />
      <Text style={{ flex: 1, fontSize: SMALL_SIZE, lineHeight: 1.3 }}>{text}</Text>
    </View>
  )
}

function MetricRow({ metrics }: { metrics: Array<{ label: string; value: string }> }) {
  return (
    <View style={styles.metrics}>
      {metrics.map((m, i) => (
        <MetricCard key={i} label={m.label} value={m.value} light={i % 2 === 1} />
      ))}
    </View>
  )
}

// ============================================================================
// Page Components (in order: 1,2,5,4,3,6)
// ============================================================================

function Page1_ExecutiveSummary({ data }: { data: PersonalizedQualification }) {
  const totalHours = annualExposureWithPeople(data)
  const valueModel = getValueModel(data)
  const tier = data.tier
  const outcome = tier === 'high' ? 'pilot_candidate' : tier === 'medium' ? 'clarify' : 'education'

  return (
    <Page size="LETTER" style={[styles.page, styles.cover]}>
      <Header title="production workflow evaluation" />
      <Text style={styles.heading}>production workflow evaluation</Text>
      <Text style={styles.coverMuted}>
        {data.identity.company} / {readable(data.identity.role || '')} / {new Date(data.generatedAt).toLocaleDateString('en-US')}
      </Text>
      <TierBadge tier={tier} />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>your result at a glance</Text>
        <MetricRow
          metrics={[
            { label: 'assessment score', value: `${data.scores.assessmentScore}/24` },
            { label: 'workflow risk', value: `${data.scores.workflowRiskScore}/24` },
            { label: 'annual hours at risk', value: formatHours(totalHours) },
            { label: 'estimated annual cost', value: formatCurrency(totalHours) },
          ]}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>verdict</Text>
        <Text style={styles.body}>{outcomeLabels[outcome]}</Text>
        <Text style={styles.muted}>
          {tier === 'high' && 'Your workflow shows strong fit, measurable risk, and clear intent. A paid pilot is the recommended next step.'}
          {tier === 'medium' && 'Your workflow has potential but needs clarification on scope, timeline, or commercial path before a pilot.'}
          {tier === 'low' && 'Current risk is low or workflow is not yet defined. Start with our field guide and assessment workshop.'}
          {(tier === 'incomplete') && 'Some answers are missing. Complete the assessment for an accurate evaluation.'}
        </Text>
      </View>

      {totalHours && (
        <ROIStatement
          text={`Based on your answers, approximately ${formatHours(totalHours)} working hours per year are exposed to rediscovery, recreation, or avoidable search. At $100/hour, that's ${formatCurrency(totalHours)} in annual risk. The pilot tests whether portals can reduce that exposure in your selected workflow.`}
        />
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>top reasons</Text>
        {data.scores && data.scores.assessmentScore && (
          <View style={styles.bulletList}>
            {getReasonCodeLabels(
              (data as any).reasonCodes || []
            ).map((reason, i) => (
              <BulletItem key={i} text={reason} />
            ))}
          </View>
        )}
      </View>

      <View style={styles.darkPanel}>
        <Text style={styles.sectionTitle}>recommended workflow</Text>
        <Text style={{ fontSize: SUB_HEADING_SIZE, marginBottom: 8 }}>{getRecommendedWorkflowLabel(data)}</Text>
        <Text style={styles.body}>
          This workflow type maps directly to a portals pilot scope. The pilot will test whether portals can preserve and recover the complete production history so your team can find, understand, reproduce, and extend valuable work.
        </Text>
      </View>

      <Text style={styles.footer}>
        draft evaluation — generated from your assessment responses. not a benchmark or guaranteed savings forecast.
      </Text>
    </Page>
  )
}

function Page2_RiskExposure({ data }: { data: PersonalizedQualification }) {
  const totalHours = annualExposureWithPeople(data)
  const valueModel = getValueModel(data)
  const recreationFreq = readable(answer(data, 'recreationFrequency'))
  const hoursLost = readable(answer(data, 'hoursLost'))
  const peopleAffected = readable(answer(data, 'peopleAffected'))
  const incidentType = readable(answer(data, 'incidentType'))
  const deliveryImpact = readable(answer(data, 'deliveryImpact'))
  const approvedVersion = readable(answer(data, 'approvedVersionMethod'))
  const contextMethod = readable(answer(data, 'productionContextMethod'))

  return (
    <Page size="LETTER" style={styles.page}>
      <Header title="production workflow evaluation" page={2} />
      <Text style={styles.heading}>risk & exposure quantification</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>annual exposure calculation</Text>
        <View style={styles.lightPanel}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
            <View style={{ width: 120 }}>
              <Text style={styles.label}>frequency</Text>
              <Text>{recreationFreq}</Text>
            </View>
            <View style={{ width: 120 }}>
              <Text style={styles.label}>hours lost / incident</Text>
              <Text>{hoursLost}</Text>
            </View>
            <View style={{ width: 120 }}>
              <Text style={styles.label}>people affected</Text>
              <Text>{peopleAffected}</Text>
            </View>
          </View>
          {totalHours && (
            <Text style={{ marginTop: 12, fontWeight: 500 }}>
              = {formatHours(totalHours)} working hours per year exposed to rediscovery or recreation
            </Text>
          )}
        </View>
      </View>

      {valueModel && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>value model (auditable)</Text>
          <View style={styles.lightPanel}>
            <Text style={styles.body}>
              formula: {valueModel.formula}
            </Text>
            <Text style={{ marginTop: 8, fontWeight: 500 }}>
              range: {formatHours(valueModel.low)} – {formatHours(valueModel.high)} hours/year · midpoint: {formatHours(valueModel.midpoint)} hours/year
            </Text>
            <Text style={styles.muted}>
              {valueModel.frequency.label} recreation frequency · {valueModel.hoursLoss.label} lost per incident · {valueModel.people.label} affected
            </Text>
            <Text style={styles.muted}>
              this estimate is based on self-reported ranges and is not a guaranteed savings claim.
            </Text>
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>risk breakdown</Text>
        <View style={styles.columns}>
          <View style={styles.column}>
            <ProblemSolutionCard
              problem={`Approved version method: ${approvedVersion}. Risk of using wrong asset or missing approvals.`}
              solution="Canonical asset registry with immutable approval state. One source of truth for every approved deliverable."
            />
            <ProblemSolutionCard
              problem={`Production context: ${contextMethod}. Decisions, references, and rationale scattered across tools.`}
              solution="Unified production record that captures decisions, references, versions, and lineage in one searchable place."
            />
          </View>
          <View style={styles.column}>
            <ProblemSolutionCard
              problem={`Recreation frequency: ${recreationFreq}. {hoursLost} per incident affecting ${peopleAffected}.`}
              solution="AI-powered search and reproduction across projects. Find and reuse work instead of rebuilding."
            />
            <ProblemSolutionCard
              problem={`Incident type: ${incidentType}. Delivery impact: ${deliveryImpact}.`}
              solution="Variant control and continuity tracking. Know what changed, why, and by whom — before it affects delivery."
            />
          </View>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>what this means for your budget</Text>
        <Text>
          {totalHours
            ? `${formatHours(totalHours)} hours at risk × $100/hr = ${formatCurrency(totalHours)} annual exposure. The 21-day pilot tests real reduction on one active workflow.`
            : 'Complete the frequency, hours lost, and people affected fields to calculate your exposure.'}
        </Text>
      </View>

      <Text style={styles.footer}>draft evaluation — generated from your assessment responses</Text>
    </Page>
  )
}

function Page3_PortalsSolvesYourProblems({ data }: { data: PersonalizedQualification }) {
  const workflow = getRecommendedWorkflowLabel(data)
  const reasonCodes = data.reasonCodes || []
  const hasApprovedVersionRisk = reasonCodes.includes('approved-version-risk')
  const hasContextFragmented = reasonCodes.includes('production-context-fragmented')
  const hasReworkRisk = reasonCodes.includes('measurable-rework-risk')
  const hasRepeatableProduction = reasonCodes.includes('repeatable-production')
  const hasStrongFit = reasonCodes.includes('strong-workflow-fit')

  return (
    <Page size="LETTER" style={styles.page}>
      <Header title="production workflow evaluation" page={3} />
      <Text style={styles.heading}>how portals solves your specific problems</Text>

      <ROIStatement
        text={`We help you validate whether portals reduces rediscovery, improves collaboration, ensures consistency, and protects delivery timelines — on your actual production work.`}
      />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>your workflow: {workflow}</Text>
        <Text style={styles.body}>
          {answer(data, 'activeWorkflow') || answer(data, 'pilotWorkflow') || 'Described in your assessment responses.'}
        </Text>
      </View>

      {hasApprovedVersionRisk && (
        <ProblemSolutionCard
          problem="Approved assets are tracked in folders, chats, or memory. Teams use wrong versions, miss approvals, or recreate work that already exists."
          solution="Portals creates a canonical asset registry. Every approved deliverable has a single, immutable record with approval state, version history, and lineage. Search returns the right asset instantly."
        />
      )}

      {hasContextFragmented && (
        <ProblemSolutionCard
          problem="Production context — decisions, references, feedback, rationale — lives in scattered tools, personal notes, and conversations. New team members can't reconstruct why choices were made."
          solution="Portals captures the complete production record: decisions, references, source files, approvals, and variants. Context stays attached to the asset, not lost in Slack or email."
        />
      )}

      {hasReworkRisk && (
        <ProblemSolutionCard
          problem="Teams recreate assets, redo work, or search extensively because they can't find what was already built. This wastes hours and delays delivery."
          solution="Portols enables search across all production history — visual, semantic, and by metadata. Find similar assets, reproduce work, and extend from proven foundations instead of starting from zero."
        />
      )}

      {hasRepeatableProduction && (
        <ProblemSolutionCard
          problem="Your workflow runs repeatedly (monthly, weekly, daily) but each run starts from scratch. Templates, brand guidelines, and past decisions aren't systematically reused."
          solution="Portols supports campaign variant control, character continuity, and 'twelve more like this' workflows. Reuse approved structures, swap assets, and maintain consistency across every iteration."
        />
      )}

      {hasStrongFit && (
        <ProblemSolutionCard
          problem="Your team structure, tools, and production volume align with what portals is built for — but you're managing it with general-purpose tools that weren't designed for creative production."
          solution="Portols replaces the patchwork of cloud storage, spreadsheets, and chat with a purpose-built production memory. One system for assets, context, versions, and handoffs."
        />
      )}

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>ai capabilities that apply to your workflow</Text>
        <View style={styles.bulletList}>
          <BulletItem text="Semantic search across all production assets — find by visual similarity, description, or context" />
          <BulletItem text="Auto-tagging and metadata extraction — reduce manual organization" />
          <BulletItem text="Variant generation — create 'twelve more like this' from approved assets" />
          <BulletItem text="Continuity tracking — maintain character, brand, and narrative consistency across episodes or campaigns" />
          <BulletItem text="Production summarization — auto-generate handoff notes, status reports, and decision logs" />
        </View>
      </View>

      <Text style={styles.footer}>draft evaluation — generated from your assessment responses</Text>
    </Page>
  )
}

function Page4_PilotPathway({ data, document }: { data: PersonalizedQualification; document: ResourceDocument }) {
  const spec = getPilotSpec(document)
  const workflow = getRecommendedWorkflowLabel(data)
  const price = packagePriceLabel(spec)
  const period = packageMilestoneLabel(spec, 'pilot period')
  const firstValue = packageMilestoneLabel(spec, 'first value')
  const participants = packageLimitLabel(spec, 'participants')
  const historicalProjects = packageLimitLabel(spec, 'historicalProjects')

  return (
    <Page size="LETTER" style={styles.page}>
      <Header title="production workflow evaluation" page={4} />
      <Text style={styles.heading}>pilot pathway</Text>

      <ROIStatement
        text={`A ${period} paid pilot on your ${workflow.toLowerCase()} workflow. First value in ${firstValue}. ${price} upfront, credited to annual deployment if you proceed.`}
      />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>pilot scope</Text>
        <View style={styles.lightPanel}>
          <View style={styles.bulletList}>
            <BulletItem text={`one active workflow: ${workflow}`} />
            <BulletItem text={`${period} evaluation window`} />
            <BulletItem text={`${firstValue} to first complete, searchable production record`} />
            <BulletItem text={`${participants} onboarded`} />
            <BulletItem text={`${historicalProjects} imported for continuity`} />
            <BulletItem text="standard integrations (manual upload, cloud storage import, or API)" />
            <BulletItem text="SOC 2 posture, encryption, tenant isolation, no training on your data" />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>success criteria</Text>
        <View style={styles.lightPanel}>
          <View style={styles.bulletList}>
            <BulletItem text="Approved asset retrieval in under 1 minute" />
            <BulletItem text="Production context recovered (decisions, references, versions)" />
            <BulletItem text="One meaningful reproduction or extension from prior work" />
            <BulletItem text="Knowledge transfer demonstrated to a new team member" />
            <BulletItem text="Variant lineage tracked (what changed, why, by whom)" />
            <BulletItem text="Continuity preserved across workflow runs" />
            <BulletItem text="Measured reduction in rediscovery or recreation time" />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>your responsibilities</Text>
        <View style={styles.lightPanel}>
          <View style={styles.bulletList}>
            <BulletItem text="Named production owner who runs the workflow daily" />
            <BulletItem text="Real active and historical work for the pilot" />
            <BulletItem text="Participating users available for onboarding" />
            <BulletItem text="Available production context (briefs, feedback, decisions)" />
            <BulletItem text="System access or exports for agreed integrations" />
            <BulletItem text="Timely feedback during the pilot" />
            <BulletItem text="Economic buyer engaged before final decision date" />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>commercial terms</Text>
        <View style={styles.lightPanel}>
          <Text style={styles.body}>
            The pilot fee is ${price} upfront for a ${period} focused commercial evaluation.
          </Text>
          <Text style={styles.muted}>
            Before launch, portals and the customer agree in writing on: annual deployment scope, annual price, pilot-fee credit window, final decision date, included users, included projects, and integrations. The pilot fee is credited toward the first annual deployment only if the customer signs within the agreed conversion window (typically 14 days after pilot ends).
          </Text>
        </View>
      </View>

      <View style={styles.darkPanel}>
        <Text style={styles.sectionTitle}>value to validate</Text>
        <Text>{pilotValueStatement(data)}</Text>
        <Text style={styles.body}>This estimate is based on self-reported ranges and is not a guaranteed savings claim or ROI forecast.</Text>
      </View>

      <Text style={styles.footer}>draft evaluation — generated from your assessment responses</Text>
    </Page>
  )
}

function pilotValueStatement(data: PersonalizedQualification): string {
  const hours = annualExposureWithPeople(data)
  if (hours) {
    return `Based on the self-reported frequency and time-loss range, approximately ${hours.toLocaleString('en-US')} working hours per year may be exposed to rediscovery, recreation, or avoidable production search. The pilot will test whether portals can reduce that exposure in the selected workflow.`
  }
  return 'The pilot will establish the current retrieval, recreation, and handoff baseline before measuring whether portals can reduce the exposure.'
}

function Page5_QualificationDeepDive({ data }: { data: PersonalizedQualification }) {
  const fit = data.scores.fit
  const pain = data.scores.pain
  const intent = data.scores.intent

  return (
    <Page size="LETTER" style={styles.page}>
      <Header title="production workflow evaluation" page={5} />
      <Text style={styles.heading}>qualification deep dive</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>fit dimension (40% weight)</Text>
        <Text style={styles.body}>Normalized: {fit.normalized}% · Coverage: {fit.coverage}%</Text>
        <View style={styles.columns}>
          <View style={styles.column}>
            <BulletItem text={`Team type: ${readable(answer(data, 'teamType'))}`} />
            <BulletItem text={`Team size: ${readable(answer(data, 'teamSize'))}`} />
            <BulletItem text={`Collaborators: ${readable(answer(data, 'workflowCollaborators'))}`} />
          </View>
          <View style={styles.column}>
            <BulletItem text={`Tools used: ${readable(answer(data, 'toolsUsed'))}`} />
            <BulletItem text={`Workflow repeatability: ${readable(answer(data, 'recurringWorkflow'))}`} />
            <BulletItem text={`Asset volume: ${readable(answer(data, 'assetVolume'))}`} />
          </View>
        </View>
        <Text style={styles.muted}>
          High fit = agency, creative studio, production company, in-house creative, brand marketing, film/animation, or game entertainment teams with repeatable workflows and multiple tools.
        </Text>
      </View>

      <SectionDivider />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>pain dimension (35% weight)</Text>
        <Text style={styles.body}>Normalized: {pain.normalized}% · Coverage: {pain.coverage}%</Text>
        <View style={styles.columns}>
          <View style={styles.column}>
            <BulletItem text={`Incident type: ${readable(answer(data, 'incidentType'))}`} />
            <BulletItem text={`Recreation frequency: ${readable(answer(data, 'recreationFrequency'))}`} />
            <BulletItem text={`Hours lost: ${readable(answer(data, 'hoursLost'))}`} />
          </View>
          <View style={styles.column}>
            <BulletItem text={`People affected: ${readable(answer(data, 'peopleAffected'))}`} />
            <BulletItem text={`Approved version method: ${readable(answer(data, 'approvedVersionMethod'))}`} />
            <BulletItem text={`Context method: ${readable(answer(data, 'productionContextMethod'))}`} />
          </View>
        </View>
        <Text style={styles.muted}>
          High pain = frequent recreation, manual version tracking, fragmented context, delivery delays, or client-facing impact.
        </Text>
      </View>

      <SectionDivider />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>intent dimension (25% weight)</Text>
        <Text style={styles.body}>Normalized: {intent.normalized}% · Coverage: {intent.coverage}%</Text>
        <View style={styles.columns}>
          <View style={styles.column}>
            <BulletItem text={`Active workflow defined: ${answer(data, 'activeWorkflow') !== 'no' ? 'Yes' : 'No'}`} />
            <BulletItem text={`Timeline: ${readable(answer(data, 'timeline'))}`} />
            <BulletItem text={`Target start: ${readable(answer(data, 'targetStartPeriod'))}`} />
          </View>
          <View style={styles.column}>
            <BulletItem text={`Pilot/pricing viewed: ${answer(data, 'pricingOrPilotViewed') ? 'Yes' : 'No'}`} />
            <BulletItem text={`Proof completed: ${answer(data, 'productProofCompleted') ? 'Yes' : 'Not yet'}`} />
            <BulletItem text={`Stakeholders involved: ${answer(data, 'stakeholderInvolved') ? 'Yes' : 'No'}`} />
            <BulletItem text={`Security diligence: ${answer(data, 'securityDiligence') ? 'Yes' : 'No'}`} />
          </View>
        </View>
        <Text style={styles.muted}>
          High intent = defined workflow, near-term timeline, stakeholder engagement, and commercial readiness signals.
        </Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>how to improve your score</Text>
        {fit.coverage < 60 && <BulletItem text="Complete team details (type, size, collaborators, tools) for better fit accuracy" />}
        {pain.coverage < 60 && <BulletItem text="Add incident details (type, frequency, hours, people, impact) for accurate risk quantification" />}
        {intent.coverage < 60 && <BulletItem text="Define your active workflow, timeline, and stakeholder involvement for stronger intent signal" />}
        {!answer(data, 'activeWorkflow') && <BulletItem text="Describe your active workflow — this is the strongest pilot readiness signal" />}
        {answer(data, 'targetStartPeriod') === 'later' && <BulletItem text="Move target start to 'this quarter' or sooner to show commercial readiness" />}
      </View>

      <Text style={styles.footer}>draft evaluation — generated from your assessment responses</Text>
    </Page>
  )
}

function Page6_DecisionFramework({ data }: { data: PersonalizedQualification }) {
  const tier = data.tier
  const outcome = tier === 'high' ? 'pilot_candidate' : tier === 'medium' ? 'clarify' : 'education'

  return (
    <Page size="LETTER" style={styles.page}>
      <Header title="production workflow evaluation" page={6} />
      <Text style={styles.heading}>decision framework & next steps</Text>

      <ROIStatement
        text={`Your tier: ${tierLabels[tier]}. Recommended path: ${outcomeLabels[outcome]}.`}
      />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>recommended next step</Text>
        <View style={styles.lightPanel}>
          {outcome === 'pilot_candidate' && (
            <>
              <Text style={{ fontWeight: 500, marginBottom: 8 }}>Start a paid pilot</Text>
              <View style={styles.bulletList}>
                <BulletItem text="Complete commercial readiness: confirm budget owner, technical evaluator, timeline, approval path" />
                <BulletItem text="Define success criteria for your specific workflow" />
                <BulletItem text="Identify integrations and data classification" />
                <BulletItem text="Schedule pilot terms review (zero-call or one-call based on scope)" />
                <BulletItem text="Launch pilot — first value in 48 hours" />
              </View>
              <Text style={styles.muted}><Text style={{ textDecoration: 'underline' }}>portals.works/paid-pilot</Text> to begin</Text>
            </>
          )}
          {outcome === 'clarify' && (
            <>
              <Text style={{ fontWeight: 500, marginBottom: 8 }}>Complete commercial readiness</Text>
              <View style={styles.bulletList}>
                <BulletItem text="Confirm $5,000 approval path (self, other, or procurement)" />
                <BulletItem text="Set target start within 60 days" />
                <BulletItem text="Name production owner and economic buyer" />
                <BulletItem text="Define success criteria for your workflow" />
                <BulletItem text="Schedule a workflow review call to clarify scope" />
              </View>
              <Text style={styles.muted}><Text style={{ textDecoration: 'underline' }}>portals.works/assessment</Text> to deepen</Text>
            </>
          )}
          {outcome === 'education' && (
            <>
              <Text style={{ fontWeight: 500, marginBottom: 8 }}>Start with education</Text>
              <View style={styles.bulletList}>
                <BulletItem text="Download the Production Memory Field Guide" />
                <BulletItem text="Attend a portals assessment workshop" />
                <BulletItem text="Re-assess when you have a defined workflow and measurable pain" />
              </View>
              <Text style={styles.muted}><Text style={{ textDecoration: 'underline' }}>portals.works/guide</Text> for the field guide</Text>
            </>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>decision checklist</Text>
        <View style={styles.columns}>
          <View style={styles.column}>
            <BulletItem text={`Budget owner identified: ${readable(answer(data, 'budgetOwner')) || 'Not yet'}`} />
            <BulletItem text={`Production owner: ${readable(answer(data, 'productionOwner')) || 'Not yet'}`} />
            <BulletItem text={`Technical evaluator: ${readable(answer(data, 'technicalEvaluator')) || 'Not yet'}`} />
          </View>
          <View style={styles.column}>
            <BulletItem text={`Approval path: ${readable(answer(data, 'approvalPath'))}`} />
            <BulletItem text={`Target start: ${readable(answer(data, 'targetStartPeriod'))}`} />
            <BulletItem text={`Security review needed: ${readable(answer(data, 'securityRequirements')) ? 'Yes' : 'Not specified'}`} />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>what happens after the pilot</Text>
        <View style={styles.lightPanel}>
          <View style={styles.bulletList}>
            <BulletItem text="Deploy portals — pilot fee credited to annual deployment" />
            <BulletItem text="Extend pilot under defined scope if more validation needed" />
            <BulletItem text="Conclude portals is not the right fit at this time — no further obligation" />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>contact</Text>
        <Text style={styles.body}>
          Questions about this evaluation or the pilot process? Reply to this email or visit <Text style={{ textDecoration: 'underline' }}>portals.works/contact</Text>.
        </Text>
      </View>

      <Text style={styles.footer}>
        personalized evaluation — generated from your assessment on {new Date(data.generatedAt).toLocaleDateString('en-US')}.
        {data.identity.company && ` prepared for ${data.identity.company}.`}
      </Text>
    </Page>
  )
}

// ============================================================================
// Main Document Export
// ============================================================================

export function AssessmentResultPdfDocument({
  data,
  document,
}: {
  data: PersonalizedQualification
  document: ResourceDocument
}): ReactElement<DocumentProps> {
  const totalHours = annualExposureWithPeople(data)
  const companySlug = (data.identity.company || 'assessment')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  const fileName = `${companySlug}-workflow-evaluation-${data.tier}.pdf`

  return (
    <Document
      title={`portals workflow evaluation - ${data.identity.company || 'assessment'} - ${data.tier}`}
      author="portals"
      subject="Personalized AI production workflow evaluation"
      creator="portals"
      producer="portals"
    >
      <Page1_ExecutiveSummary data={data} />
      <Page2_RiskExposure data={data} />
      <Page3_PortalsSolvesYourProblems data={data} />
      <Page4_PilotPathway data={data} document={document} />
      <Page5_QualificationDeepDive data={data} />
      <Page6_DecisionFramework data={data} />
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