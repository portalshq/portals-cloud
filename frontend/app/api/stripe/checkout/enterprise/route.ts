import {NextResponse} from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type EnterpriseBody = {
  email?: string
  name?: string
  company?: string
  requirements?: string
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: EnterpriseBody
  try {
    body = (await request.json()) as EnterpriseBody
  } catch {
    return NextResponse.json({ok: false, message: 'invalid request body'}, {status: 400})
  }

  // Enterprise pricing is custom - no Stripe checkout
  // Return contact information or redirect to sales contact
  return NextResponse.json({
    ok: true,
    message: 'Enterprise pricing is custom. Please contact sales for a quote.',
    contactEmail: 'sales@portals.works',
    nextSteps: 'Our team will reach out within 1 business day to discuss your requirements.',
  })
}
