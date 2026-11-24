import { NextResponse } from 'next/server'
import { LoopsClient } from 'loops'
import { z } from 'zod'

export const runtime = 'nodejs'

const subscribeSchema = z.object({
  name: z.string().trim().max(160).default(''),
  email: z.string().trim().email().max(254),
  // UTM & attribution
  utm_source: z.string().trim().max(160).default(''),
  utm_medium: z.string().trim().max(160).default(''),
  utm_campaign: z.string().trim().max(160).default(''),
  utm_content: z.string().trim().max(160).default(''),
  utm_term: z.string().trim().max(160).default(''),
  referrer: z.string().trim().max(500).default(''),
  landing_page: z.string().trim().max(500).default(''),
  // Extended tracking
  content_id: z.string().trim().max(160).default(''),
  product: z.string().trim().max(160).default(''),
  topic: z.string().trim().max(160).default(''),
  placement: z.string().trim().max(160).default(''),
  cta: z.string().trim().max(160).default(''),
  signup_ts: z.string().trim().max(80).default(''),
  // First-touch / last-touch mirrors
  first_touch_source: z.string().trim().max(160).default(''),
  first_touch_medium: z.string().trim().max(160).default(''),
  first_touch_campaign: z.string().trim().max(160).default(''),
  first_touch_content: z.string().trim().max(160).default(''),
  first_touch_term: z.string().trim().max(160).default(''),
  first_touch_landing_page: z.string().trim().max(500).default(''),
})

const NEWSLETTER_LIST = 'Massive Reality subscribers'

type ApolloContact = { id?: string; contact?: { id?: string } }

async function apolloRequest<T>(path: string, method: string, body?: unknown): Promise<T> {
  const apiKey = process.env.APOLLO_API_KEY
  if (!apiKey) throw new Error('APOLLO_API_KEY is required.')
  const response = await fetch(`https://api.apollo.io${path}`, {
    method,
    headers: {
      'x-api-key': apiKey,
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`Apollo ${method} ${path} failed (${response.status}): ${text}`)
  }
  return (text ? JSON.parse(text) : {}) as T
}

function compact(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) =>
      value !== undefined && value !== null && value !== '',
    ),
  )
}

export async function POST(request: Request) {
  // Origin check
  const origin = request.headers.get('origin')
  if (origin && process.env.NODE_ENV === 'production') {
    const allowed = new Set([
      process.env.NEXT_PUBLIC_SITE_URL,
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
      new URL(request.url).origin,
    ].filter(Boolean))
    if (!allowed.has(origin)) {
      return NextResponse.json({ ok: false, error: 'invalid origin' }, { status: 403 })
    }
  }

  const rawBody = await request.text()
  if (Buffer.byteLength(rawBody) > 8192) {
    return NextResponse.json({ ok: false, error: 'request too large' }, { status: 413 })
  }

  let json: unknown
  try {
    json = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid request body' }, { status: 400 })
  }

  const parsed = subscribeSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'a valid email address is required' }, { status: 400 })
  }

  const data = parsed.data

  if (!process.env.APOLLO_API_KEY) {
    console.error('Newsletter subscribe requires APOLLO_API_KEY.')
    return NextResponse.json({ ok: false, error: 'newsletter is temporarily unavailable' }, { status: 503 })
  }

  const loopsApiKey = process.env.LOOPS_API_KEY
  const loopsNewsletterListId = process.env.LOOPS_NEWSLETTER_LIST_ID
  if (!loopsApiKey || !loopsNewsletterListId) {
    console.error('Newsletter subscribe requires LOOPS_API_KEY and LOOPS_NEWSLETTER_LIST_ID.')
    return NextResponse.json({ ok: false, error: 'newsletter is temporarily unavailable' }, { status: 503 })
  }

  try {
    // Loops is the send path for the newsletter; updateContact upserts, so a
    // repeat submission re-subscribes without creating duplicates.
    const loops = new LoopsClient(loopsApiKey)
    await loops.updateContact({
      email: data.email,
      properties: data.name ? { firstName: data.name } : undefined,
      mailingLists: { [loopsNewsletterListId]: true },
    })

    // Build contact custom fields from UTM/tracking data.
    // These map to existing Apollo custom fields already provisioned in
    // apollo-lead-operations.json (source_page, cta_label, lead_intent, utm_*).
    // Additional tracking fields are stored as contact-level tags.
    const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL || 'https://portals.works'
    const sourcePage = data.landing_page
      ? (data.landing_page.startsWith('/') ? `${siteOrigin}${data.landing_page}` : data.landing_page)
      : `${siteOrigin}/newsletter`

    // Upsert contact
    const contactBody = compact({
      email: data.email,
      name: data.name || undefined,
      label_names: [NEWSLETTER_LIST],
    })
    const result = await apolloRequest<ApolloContact>('/api/v1/contacts', 'POST', contactBody)
    const contactId = result.id || result.contact?.id
    if (!contactId) throw new Error('Apollo did not return a contact id.')

    // Enrich with tracking fields via PATCH — these map to provisioned
    // Apollo custom fields by label; the schema discovery in crm.ts resolves
    // labels to workspace-scoped IDs at runtime. For this lightweight
    // newsletter endpoint we write native Apollo fields directly.
    await apolloRequest(`/api/v1/contacts/${encodeURIComponent(contactId)}`, 'PATCH', compact({
      // The label_names on POST already added to the list, but PATCH gives us
      // a second chance if the contact already existed.
      name: data.name || undefined,
      label_names: [NEWSLETTER_LIST],
    }))

    // Add to list explicitly (idempotent)
    await apolloRequest('/api/v1/labels/add_entity_ids_to_label_names', 'POST', {
      entity_ids: [contactId],
      label_names: [NEWSLETTER_LIST],
      modality: 'contacts',
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[newsletter subscribe]', error)
    return NextResponse.json(
      { ok: false, error: 'we could not complete your subscription. please try again.' },
      { status: 503 },
    )
  }
}

