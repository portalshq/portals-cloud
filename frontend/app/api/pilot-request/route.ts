import {NextResponse} from 'next/server'
import {z} from 'zod'

export const runtime = 'nodejs'

const pilotRequestSchema = z.object({
  submissionId: z.string().uuid(),
  email: z.string().trim().email().max(254),
  company: z.string().trim().min(1).max(160),
  role: z.string().trim().min(1).max(120),
  website: z.string().trim().min(1).max(300),
  workflow: z.string().trim().min(1).max(2000),
  activeNow: z.string().trim().min(1).max(80),
  stakeholders: z.string().trim().min(1).max(1000),
  currentTools: z.string().trim().min(1).max(1000),
  desiredOutcome: z.string().trim().min(1).max(2000),
  timeline: z.string().trim().min(1).max(120),
  message: z.string().trim().max(3000).optional().default(''),
  companyFax: z.string().max(0).optional().default(''),
})

type PilotRequest = z.infer<typeof pilotRequestSchema>

type AttioRecordResponse = {
  data?: {
    id?: {
      record_id?: string
    }
    web_url?: string
  }
}

function normalizedDomain(website: string): string {
  const url = new URL(
    website.match(/^https?:\/\//i) ? website : `https://${website}`,
  )
  return url.hostname.toLowerCase().replace(/^www\./, '')
}

function scopeNote(data: PilotRequest, domain: string): string {
  return [
    `# paid pilot request`,
    '',
    `- work email: ${data.email}`,
    `- company: ${data.company}`,
    `- company domain: ${domain}`,
    `- role: ${data.role}`,
    `- website: ${data.website}`,
    `- active now: ${data.activeNow}`,
    `- timeline: ${data.timeline}`,
    '',
    `## workflow to test`,
    data.workflow,
    '',
    `## people involved`,
    data.stakeholders,
    '',
    `## current tools`,
    data.currentTools,
    '',
    `## desired outcome`,
    data.desiredOutcome,
    '',
    `## message`,
    data.message || 'none provided',
    '',
    `submission id: ${data.submissionId}`,
  ].join('\n')
}

async function attioRequest<T>(
  path: string,
  method: 'POST' | 'PUT',
  body: unknown,
): Promise<T> {
  const response = await fetch(`https://api.attio.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.ATTIO_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Attio ${method} ${path} failed (${response.status}): ${detail}`)
  }

  return (await response.json()) as T
}

async function sendEmail({
  idempotencyKey,
  to,
  subject,
  text,
  replyTo,
}: {
  idempotencyKey: string
  to: string | string[]
  subject: string
  text: string
  replyTo?: string
}) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
      'User-Agent': 'portals-pilot-form/1.0',
    },
    body: JSON.stringify({
      from: process.env.PILOT_EMAIL_FROM,
      to,
      subject,
      text,
      ...(replyTo ? {reply_to: replyTo} : {}),
    }),
    cache: 'no-store',
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Resend email failed (${response.status}): ${detail}`)
  }
}

function requiredIntegrationSettingsPresent(): boolean {
  return Boolean(
    process.env.ATTIO_API_KEY &&
      process.env.RESEND_API_KEY &&
      process.env.PILOT_EMAIL_FROM &&
      process.env.PILOT_NOTIFICATION_EMAIL,
  )
}

export async function POST(request: Request) {
  let json: unknown

  try {
    json = await request.json()
  } catch {
    return NextResponse.json(
      {ok: false, error: 'invalid request body'},
      {status: 400},
    )
  }

  const parsed = pilotRequestSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      {ok: false, error: 'please complete every required field'},
      {status: 400},
    )
  }

  const data = parsed.data
  let domain: string

  try {
    domain = normalizedDomain(data.website)
  } catch {
    return NextResponse.json(
      {ok: false, error: 'please enter a valid company website'},
      {status: 400},
    )
  }

  if (!domain.includes('.')) {
    return NextResponse.json(
      {ok: false, error: 'please enter a valid company website'},
      {status: 400},
    )
  }

  if (!requiredIntegrationSettingsPresent()) {
    if (process.env.NODE_ENV !== 'production') {
      return NextResponse.json({
        ok: true,
        preview: true,
        calendarUrl: process.env.PILOT_CALENDAR_URL || null,
      })
    }

    console.error('Paid pilot form integrations are not configured.')
    return NextResponse.json(
      {
        ok: false,
        error: 'pilot requests are temporarily unavailable. email sales@portals.works.',
      },
      {status: 503},
    )
  }

  const note = scopeNote(data, domain)

  try {
    await attioRequest<AttioRecordResponse>(
      '/v2/objects/companies/records?matching_attribute=domains',
      'PUT',
      {
        data: {
          values: {
            name: data.company,
            domains: [domain],
            description: `paid pilot request from ${data.email}`,
          },
        },
      },
    )

    await attioRequest<AttioRecordResponse>(
      '/v2/objects/people/records?matching_attribute=email_addresses',
      'PUT',
      {
        data: {
          values: {
            email_addresses: [data.email],
            job_title: data.role,
            company: {
              target_object: 'companies',
              domains: [{domain}],
            },
            description: `paid pilot request for ${data.company}`,
          },
        },
      },
    )

    const deal = await attioRequest<AttioRecordResponse>(
      '/v2/objects/deals/records',
      'POST',
      {
        data: {
          values: {
            name: `paid pilot - ${data.company}`,
            stage: process.env.ATTIO_PILOT_STAGE || 'Pilot Requested',
            value: 5000,
            associated_people: [
              {
                target_object: 'people',
                email_addresses: [{email_address: data.email}],
              },
            ],
            associated_company: {
              target_object: 'companies',
              domains: [{domain}],
            },
          },
        },
      },
    )

    const dealRecordId = deal.data?.id?.record_id
    if (!dealRecordId) {
      throw new Error('Attio created a deal without returning a record id.')
    }

    const calendarUrl = process.env.PILOT_CALENDAR_URL || ''
    const confirmationText = [
      `thanks for scoping a paid production pilot with portals.`,
      '',
      `we received your request for ${data.company} and will review the workflow, integrations, people, timing, and desired outcome before confirming fit.`,
      '',
      `the proposed pilot is 21 days and $5,000 upfront. scope, annual deployment pricing, credit terms, success criteria, and the final decision date are agreed before kickoff.`,
      ...(calendarUrl
        ? ['', `choose a time to discuss the pilot: ${calendarUrl}`]
        : ['', `we'll follow up with next steps.`]),
      '',
      `portals`,
    ].join('\n')

    const notificationText = [
      `new paid pilot request`,
      '',
      note,
      '',
      `attio deal: ${deal.data?.web_url || dealRecordId}`,
    ].join('\n')

    const sideEffects = await Promise.allSettled([
      attioRequest(
        '/v2/notes',
        'POST',
        {
          data: {
            parent_object: 'deals',
            parent_record_id: dealRecordId,
            title: 'paid pilot request',
            format: 'markdown',
            content: note,
          },
        },
      ),
      sendEmail({
        idempotencyKey: `${data.submissionId}-confirmation`,
        to: data.email,
        subject: 'we received your portals paid pilot request',
        text: confirmationText,
      }),
      sendEmail({
        idempotencyKey: `${data.submissionId}-founder`,
        to: process.env.PILOT_NOTIFICATION_EMAIL as string,
        subject: `paid pilot requested - ${data.company}`,
        text: notificationText,
        replyTo: data.email,
      }),
    ])

    for (const result of sideEffects) {
      if (result.status === 'rejected') {
        console.error('Paid pilot follow-up failed:', result.reason)
      }
    }

    return NextResponse.json({
      ok: true,
      calendarUrl: calendarUrl || null,
    })
  } catch (error) {
    console.error('Paid pilot request failed:', error)
    return NextResponse.json(
      {
        ok: false,
        error: 'we could not submit the request. email sales@portals.works.',
      },
      {status: 502},
    )
  }
}
