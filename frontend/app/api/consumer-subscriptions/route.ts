import { timingSafeEqual } from 'node:crypto'
import { after } from 'next/server'
import { z } from 'zod'
import { DISCLOSURE_VERSION, leadRequestSchema } from '@/lib/leads/contracts'
import { persistSubmission, leadsDryRun } from '@/lib/leads/store'

const inputSchema = z.object({
  id: z.string().min(8).max(160), email: z.string().trim().email().max(254),
  payload: z.object({
    programId: z.string().trim().min(1).max(256), episode: z.boolean(), weekly: z.boolean(),
    generalSchedule: z.boolean().default(false), consentSource: z.string().max(160).default('show-page'),
    sourcePage: z.string().max(500).default(''), referrer: z.string().max(500).default(''),
    referral: z.string().max(160).default(''),
    utmSource: z.string().max(160).default(''), utmMedium: z.string().max(160).default(''),
    utmCampaign: z.string().max(160).default(''), utmContent: z.string().max(160).default(''), utmTerm: z.string().max(160).default(''),
  }),
})

export async function POST(request: Request) {
  const secret = process.env.CONSUMER_CRM_INGEST_SECRET ?? ''
  const supplied = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1] ?? ''
  const expectedBytes = Buffer.from(secret), suppliedBytes = Buffer.from(supplied)
  if (expectedBytes.length < 32 || suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const raw = await request.text()
  if (Buffer.byteLength(raw) > 16_384) return Response.json({ error: 'Request too large' }, { status: 413 })
  let value: unknown
  try { value = JSON.parse(raw) } catch { return Response.json({ error: 'Invalid request' }, { status: 400 }) }
  const parsed = inputSchema.safeParse(value)
  if (!parsed.success) return Response.json({ error: 'Invalid request' }, { status: 400 })
  const { id, email, payload } = parsed.data
  const lead = leadRequestSchema.parse({
    submissionType: 'show_subscription', provider: 'browser', idempotencyKey: `show-subscription:${id}`,
    formVersion: 'show-subscription-v1', identity: { email },
    attribution: { sourcePage: payload.sourcePage || '/shows', ctaLabel: 'show reminders', intent: 'show_subscription',
      referrer: payload.referrer, utmSource: payload.utmSource, utmMedium: payload.utmMedium,
      utmCampaign: payload.utmCampaign, utmContent: payload.utmContent, utmTerm: payload.utmTerm },
    consent: { disclosureVersion: DISCLOSURE_VERSION, marketing: false, analytics: false },
    answers: { programId: payload.programId, episode: payload.episode, weekly: payload.weekly, generalSchedule: payload.generalSchedule, referral: payload.referral },
  })
  try {
    await persistSubmission({ request: lead, identity: { email, website: '' }, verified: true,
      suppressProfileToken: true, response: { ok: true, nextAction: 'follow_up' } })
    if (!leadsDryRun()) after(async () => { const { processLeadOutbox } = await import('@/lib/leads/processor'); await processLeadOutbox(10) })
    return Response.json({ ok: true })
  } catch (error) {
    console.error('[consumer subscription intake]', error)
    return Response.json({ error: 'Intake unavailable' }, { status: 503 })
  }
}
