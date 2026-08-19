import React, {type ReactElement} from 'react'
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
} from '@/lib/leads/contracts'
import {pilotControlledOptionLists} from '@/lib/leads/contracts'
import {stateLabel} from '@/lib/leads/pilot'
import type {StoredPilot} from '@/lib/leads/store'
import type {ResourceDocument} from '@/types/resource'
import {
  PACKAGE_SPEC_SLUGS,
  findPackageSpecification,
  packageMilestoneLabel,
  packagePriceLabel,
} from '@/lib/package-specifications'
import {formatReadableDate} from '@/lib/utils'

const HEADING_SIZE = 22
const NORMAL_SIZE = 10.5
const FONT_ROOT = path.resolve(process.cwd(), 'public/fonts/pdf')

Font.register({
  family: 'DieGroteskB',
  fonts: [
    {src: path.join(FONT_ROOT, 'DieGroteskB-Regular.ttf'), fontWeight: 400},
    {src: path.join(FONT_ROOT, 'DieGroteskB-Medium.ttf'), fontWeight: 500},
  ],
})
Font.register({
  family: 'DieGroteskC',
  fonts: [
    {src: path.join(FONT_ROOT, 'DieGroteskC-Light.ttf'), fontWeight: 300},
  ],
})

const colors = {
  ink: '#07112C',
  blue: '#2F66B5',
  lightBlue: '#79C7DA',
  pale: '#EAF6FA',
  white: '#FFFFFF',
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
  cover: {backgroundColor: colors.ink, color: colors.white},
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  wordmark: {fontWeight: 500},
  heading: {
    fontFamily: 'DieGroteskC',
    fontSize: HEADING_SIZE,
    fontWeight: 300,
    lineHeight: 1.04,
  },
  body: {marginTop: 8},
  muted: {marginTop: 6, color: '#52617D'},
  coverMuted: {marginTop: 8, color: colors.lightBlue},
  section: {marginTop: 20},
  sectionTitle: {
    marginBottom: 8,
    fontFamily: 'DieGroteskC',
    fontSize: HEADING_SIZE,
    fontWeight: 300,
    lineHeight: 1.04,
  },
  metrics: {marginTop: 24, flexDirection: 'row', gap: 10},
  metric: {width: 154, padding: 12, backgroundColor: '#17264A'},
  lightMetric: {width: 154, padding: 12, backgroundColor: colors.pale},
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
  columns: {flexDirection: 'row', gap: 24},
  column: {width: 250},
  item: {marginBottom: 8},
  label: {fontWeight: 500},
  panel: {marginTop: 18, padding: 14, backgroundColor: '#17264A'},
  darkPanel: {
    marginTop: 18,
    padding: 14,
    backgroundColor: colors.ink,
    color: colors.white,
  },
  footer: {
    position: 'absolute',
    left: 44,
    right: 44,
    bottom: 20,
    color: '#52617D',
  },
  criterionRow: {
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E5EBF4',
    paddingBottom: 5,
  },
  sigLine: {
    marginTop: 22,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.ink,
  },
})

export type PersonalizedQualification = {
  identity: LeadIdentity
  answers: Record<string, unknown>
  scores: QualificationScores
  tier: QualificationTier
  recommendedWorkflow: string
  generatedAt: string
}

const labels: Record<string, string> = {
  'five-more-like-this': 'twelve more like this',
  'approved-version-retrieval': 'approved-version retrieval',
  'character-continuity': 'character continuity',
  'campaign-variant-control': 'campaign variant control',
  'production-handoff': 'production handoff',
  'asset-reproduction': 'asset reproduction',
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

function briefAnswer(
  data: PersonalizedQualification,
  key: string,
  maximum: number,
): string {
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

function timeAtRisk(data: PersonalizedQualification): string | null {
  const hours = annualExposureHours(data)
  if (!hours) return null
  return `approximately ${hours.toLocaleString('en-US')} working hours per year are exposed to rediscovery or recreation at the reported frequency and time-loss range.`
}

function pilotValueStatement(data: PersonalizedQualification): string {
  const hours = annualExposureHours(data)
  if (hours) {
    return `based on the self-reported frequency and time-loss range, approximately ${hours.toLocaleString('en-US')} working hours per year may be exposed to rediscovery, recreation, or avoidable production search. the pilot will test whether portals can reduce that exposure in the selected workflow.`
  }
  return 'the pilot will establish the current retrieval, recreation, and handoff baseline before measuring whether portals can reduce the exposure.'
}

function Header({title, page}: {title: string; page?: number}) {
  return (
    <View style={styles.header}>
      <Text style={styles.wordmark}>portals</Text>
      <Text>{page ? `${title} / ${page}` : title}</Text>
    </View>
  )
}

export function AssessmentResultPdfDocument({
  data,
}: {
  data: PersonalizedQualification
}): ReactElement<DocumentProps> {
  const risk = timeAtRisk(data)
  return (
    <Document
      title={`portals workflow assessment - ${data.identity.company || 'assessment'}`}
      author="portals"
      subject="Personalized AI production workflow assessment"
      creator="portals"
      producer="portals"
    >
      <Page size="LETTER" style={[styles.page, styles.cover]}>
        <Header title="workflow assessment" />
        <Text style={styles.heading}>production workflow assessment</Text>
        <Text style={styles.coverMuted}>
          {data.identity.company} / {readable(data.identity.role || '')} / {new Date(data.generatedAt).toLocaleDateString('en-US')}
        </Text>
        <Text style={styles.coverMuted}>
          production-memory risk {data.scores.workflowRiskScore ?? Math.round((data.scores.pain.normalized / 100) * 24)}/24
        </Text>
        <Text style={styles.body}>
          this result summarizes reported production conditions and routes the most useful next step. it is not a benchmark or guaranteed savings forecast.
        </Text>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>current production state</Text>
          <View style={styles.columns}>
            <View style={styles.column}>
              <Text style={styles.item}><Text style={styles.label}>team:</Text> {readable(answer(data, 'teamType'))}, {readable(answer(data, 'teamSize'))}</Text>
              <Text style={styles.item}><Text style={styles.label}>workflow collaborators:</Text> {readable(answer(data, 'workflowCollaborators'))}</Text>
              <Text style={styles.item}><Text style={styles.label}>tools used:</Text> {readable(answer(data, 'toolsUsed'))}</Text>
              <Text style={styles.item}><Text style={styles.label}>approved version:</Text> {readable(answer(data, 'approvedVersionMethod'))}</Text>
            </View>
            <View style={styles.column}>
              <Text style={styles.item}><Text style={styles.label}>production context:</Text> {readable(answer(data, 'productionContextMethod'))}</Text>
              <Text style={styles.item}><Text style={styles.label}>recreation frequency:</Text> {readable(answer(data, 'recreationFrequency'))}</Text>
              <Text style={styles.item}><Text style={styles.label}>most recent incident:</Text> {readable(answer(data, 'incidentType'))}</Text>
              <Text style={styles.item}><Text style={styles.label}>delivery impact:</Text> {readable(answer(data, 'deliveryImpact'))}</Text>
            </View>
          </View>
        </View>

        <View style={styles.darkPanel}>
          <Text style={styles.sectionTitle}>recommended workflow</Text>
          <Text>{labels[data.recommendedWorkflow] || readable(data.recommendedWorkflow)}</Text>
          {risk ? <Text style={styles.body}>{risk}</Text> : null}
          <Text style={styles.body}>
            a paid pilot should validate actual retrieval, reproduction, and rework reduction against one active workflow before any ROI claim is made.
          </Text>
        </View>
      </Page>
    </Document>
  )
}

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
