import {assessmentScore} from './scoring'
import type {StoredSubmission} from './store'

type Event = {event: string; properties: Record<string, unknown>}

export async function trackSubmissionEvents(
  submission: StoredSubmission,
): Promise<void> {
  const token =
    process.env.MIXPANEL_PROJECT_TOKEN || process.env.NEXT_PUBLIC_MIXPANEL_TOKEN
  if (!token) throw new Error('MIXPANEL_PROJECT_TOKEN is required.')
  const common = {
    token,
    distinct_id: submission.profile.analyticsPersonId,
    person_id: submission.profile.analyticsPersonId,
    company_domain: submission.profile.companyDomain,
    intent: submission.request.attribution.intent,
    source_page: submission.request.attribution.sourcePage,
    cta_label: submission.request.attribution.ctaLabel,
    use_case: submission.request.attribution.useCase,
    qualification_score: submission.scores
      ? assessmentScore(submission.scores)
      : undefined,
    qualification_tier: submission.tier,
    utm_source: submission.request.attribution.utmSource,
    utm_campaign: submission.request.attribution.utmCampaign,
    score_version: submission.scores?.version,
    time: Math.floor(Date.now() / 1000),
  }
  const events: Event[] = []
  if (submission.request.submissionType === 'commercial_event') {
    events.push({
      event: submission.request.answers.event,
      properties: {
        ...common,
        revenue_amount: submission.request.answers.revenueAmount,
        currency: submission.request.answers.currency,
      },
    })
  } else {
    events.push({event: 'form_submitted', properties: common})
  }
  if (
    ['guide_download', 'security_download', 'pilot_brief_download'].includes(
      submission.request.submissionType,
    )
  ) {
    events.push({event: 'guide_downloaded', properties: common})
  }
  if (submission.request.submissionType === 'assessment') {
    events.push({event: 'assessment_completed', properties: common})
  }
  if (submission.scores) {
    events.push({event: 'qualification_assigned', properties: common})
  }
  if (submission.request.submissionType === 'pilot_request') {
    events.push({event: 'pilot_requested', properties: common})
  }
  if (submission.response.nextAction === 'calendar') {
    events.push({event: 'calendar_shown', properties: common})
  }
  const response = await fetch('https://api.mixpanel.com/track', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(
      events.map((event) => ({
        ...event,
        properties: {
          ...event.properties,
          $insert_id: `${submission.id}:${event.event}`,
        },
      })),
    ),
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error(`Mixpanel tracking failed (${response.status}).`)
  }
}
