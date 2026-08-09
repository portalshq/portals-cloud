import {NextResponse} from 'next/server'
import Stripe from 'stripe'
import {getProductConfig} from '@/config/stripe-products'
import {
  createBillingCustomer,
  createBillingCheckoutSession,
} from '@/lib/leads/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type CheckoutBody = {
  email?: string
  name?: string
  metadata?: Record<string, string>
}

export async function POST(request: Request): Promise<NextResponse> {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    return NextResponse.json({ok: false, message: 'Stripe not configured'}, {status: 500})
  }

  let body: CheckoutBody
  try {
    body = (await request.json()) as CheckoutBody
  } catch {
    return NextResponse.json({ok: false, message: 'invalid request body'}, {status: 400})
  }

  const stripe = new Stripe(secretKey)
  const productConfig = getProductConfig('studioPilot')

  try {
    // Create or get customer
    let customerId: string
    if (body.email) {
      const existingCustomers = await stripe.customers.list({email: body.email, limit: 1})
      if (existingCustomers.data.length > 0) {
        customerId = existingCustomers.data[0].id
      } else {
        const customer = await stripe.customers.create({
          email: body.email,
          name: body.name,
          metadata: body.metadata || {},
        })
        customerId = customer.id
        await createBillingCustomer({
          id: customer.id,
          email: customer.email || undefined,
          name: customer.name || undefined,
          metadata: customer.metadata,
        })
      }
    } else {
      const customer = await stripe.customers.create({
        name: body.name,
        metadata: body.metadata || {},
      })
      customerId = customer.id
      await createBillingCustomer({
        id: customer.id,
        email: customer.email || undefined,
        name: customer.name || undefined,
        metadata: customer.metadata,
      })
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      line_items: [
        {
          price: productConfig.priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://portals.works'}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://portals.works'}/checkout/canceled`,
      metadata: {
        product_type: 'studio-pilot',
        ...body.metadata,
      },
    })

    await createBillingCheckoutSession({
      id: session.id,
      customerId: customerId || undefined,
      productType: 'studio-pilot',
      status: session.status || 'unknown',
      metadata: {
        ...session.metadata,
        amount: productConfig.amount.toString(),
        currency: productConfig.currency,
      },
    })

    return NextResponse.json({
      ok: true,
      url: session.url,
      sessionId: session.id,
    })
  } catch (error) {
    console.error('Studio Pilot checkout error:', error)
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : 'Checkout failed',
      },
      {status: 500},
    )
  }
}
