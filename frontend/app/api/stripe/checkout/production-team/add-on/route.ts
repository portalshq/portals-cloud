import {NextResponse} from 'next/server'
import {cookies} from 'next/headers'
import {createStripePlatformBilling} from '@portalshq/platform-billing'
import {getProductConfig} from '@/config/stripe-products'
import {APP_SESSION_COOKIE, currentApplicationUser} from '@/lib/leads/application-auth'
import {getPublishedPackageSpecification, packageAddOnSeatPrice, packageAnnualAmount} from '@/lib/package-specifications'
import {createBillingCheckoutSession, createBillingCustomer} from '@/lib/leads/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(): Promise<NextResponse> {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) return NextResponse.json({ok: false, message: 'Stripe not configured'}, {status: 500})
  const cookieStore = await cookies()
  const user = await currentApplicationUser(cookieStore.get(APP_SESSION_COOKIE)?.value)
  if (!user) return NextResponse.json({ok: false, message: 'sign in required'}, {status: 401})

  const specification = await getPublishedPackageSpecification('production-team')
  const monthly = packageAddOnSeatPrice(specification || undefined)
  const baseMonthly = specification?.price?.amount
  const annualAmount = packageAnnualAmount(specification || undefined)
  if (!monthly || !baseMonthly || !annualAmount) {
    return NextResponse.json({ok: false, message: 'Add-on pricing is unavailable'}, {status: 503})
  }
  const amount = Math.round((monthly / baseMonthly) * annualAmount)

  try {
    const billing = createStripePlatformBilling(secretKey)
    const {customer, created} = await billing.findOrCreateCustomer({email: user.email, name: user.displayName})
    if (created) await createBillingCustomer({id: customer.id, email: customer.email || undefined, name: customer.name || undefined, metadata: customer.metadata})
    const product = getProductConfig('productionTeamAddOnSeat')
    const session = await billing.createCheckoutSession({
      mode: 'subscription',
      customer: customer.id,
      line_items: [{price: product.priceId, quantity: 1}],
      subscription_data: {metadata: {product_type: 'production-team-addon', annual_term_amount: String(amount)}},
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://portals.works'}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://portals.works'}/account/billing`,
      metadata: {product_type: 'production-team-addon', annual_term_amount: String(amount)},
    })
    await createBillingCheckoutSession({
      id: session.id,
      customerId: customer.id,
      productType: 'production-team-addon',
      status: session.status || 'unknown',
      metadata: {...session.metadata, amount: String(amount), currency: specification.price?.currency || 'USD'},
    })
    return NextResponse.json({ok: true, url: session.url, sessionId: session.id})
  } catch (error) {
    console.error('Production Team add-on checkout error:', error)
    return NextResponse.json({ok: false, message: error instanceof Error ? error.message : 'Checkout failed'}, {status: 500})
  }
}
