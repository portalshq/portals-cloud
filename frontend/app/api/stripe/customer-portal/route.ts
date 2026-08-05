import {NextResponse} from 'next/server'
import Stripe from 'stripe'
import {getBillingCustomer} from '@/lib/leads/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type CustomerPortalBody = {
  customerId: string
  returnUrl?: string
}

export async function POST(request: Request): Promise<NextResponse> {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    return NextResponse.json({ok: false, message: 'Stripe not configured'}, {status: 500})
  }

  let body: CustomerPortalBody
  try {
    body = (await request.json()) as CustomerPortalBody
  } catch {
    return NextResponse.json({ok: false, message: 'invalid request body'}, {status: 400})
  }

  if (!body.customerId) {
    return NextResponse.json({ok: false, message: 'customerId is required'}, {status: 400})
  }

  const stripe = new Stripe(secretKey)

  try {
    // Verify customer exists in our database
    const customer = await getBillingCustomer(body.customerId)
    if (!customer) {
      return NextResponse.json({ok: false, message: 'Customer not found'}, {status: 404})
    }

    // Create customer portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: body.customerId,
      return_url: body.returnUrl || `${process.env.NEXT_PUBLIC_SITE_URL || 'https://portals.works'}/account`,
    })

    return NextResponse.json({
      ok: true,
      url: portalSession.url,
    })
  } catch (error) {
    console.error('Customer Portal error:', error)
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : 'Failed to create portal session',
      },
      {status: 500},
    )
  }
}
