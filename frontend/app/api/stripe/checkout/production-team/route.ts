import {NextResponse} from 'next/server'
import {cookies} from 'next/headers'
import {createStripePlatformBilling} from '@portalshq/platform-billing'
import {getProductConfig} from '@/config/stripe-products'
import {
  createBillingCustomer,
  createBillingCheckoutSession,
} from '@/lib/leads/store'
import {APP_SESSION_COOKIE, currentApplicationUser} from '@/lib/leads/application-auth'
import {getPublishedPackageSpecification, packageAnnualAmount, packageOnboardingFee, packageInstallmentsAvailable} from '@/lib/package-specifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type CheckoutBody = {
  billingCadence?: 'annual' | 'quarterly'
}

export async function POST(request: Request): Promise<NextResponse> {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    return NextResponse.json({ok: false, message: 'Stripe not configured'}, {status: 500})
  }

  const cookieStore = await cookies()
  const user = await currentApplicationUser(cookieStore.get(APP_SESSION_COOKIE)?.value)
  if (!user) return NextResponse.json({ok: false, message: 'sign in required'}, {status: 401})

  let body: CheckoutBody
  try {
    body = (await request.json()) as CheckoutBody
  } catch {
    return NextResponse.json({ok: false, message: 'invalid request body'}, {status: 400})
  }

  const billing = createStripePlatformBilling(secretKey)
  const packageSpec = await getPublishedPackageSpecification('production-team')
  if (!packageSpec) return NextResponse.json({ok: false, message: 'Production Team package unavailable'}, {status: 503})
  const cadence = body.billingCadence || 'annual'
  if (cadence === 'quarterly' && (!packageInstallmentsAvailable(packageSpec) || packageSpec.price?.installmentSchedule?.interval !== 'quarter')) {
    return NextResponse.json({ok: false, message: 'Quarterly installments are not available'}, {status: 400})
  }
  const productConfig = getProductConfig(cadence === 'quarterly' ? 'productionTeamQuarterly' : 'productionTeamAnnual')
  const onboardingConfig = getProductConfig('productionTeamOnboarding')
  const annualAmount = packageAnnualAmount(packageSpec)
  const onboardingFee = packageOnboardingFee(packageSpec)
  const installmentSchedule = packageSpec.price?.installmentSchedule
  if (!annualAmount || !onboardingFee || (cadence === 'quarterly' && (!installmentSchedule?.count || annualAmount % installmentSchedule.count !== 0))) {
    return NextResponse.json({ok: false, message: 'Production Team pricing is incomplete'}, {status: 503})
  }

  try {
    const {customer, created} = await billing.findOrCreateCustomer({
    email: user.email,
      name: user.displayName,
      metadata: {product_type: 'production-team'},
    })
    const customerId = customer.id
    if (created) {
      await createBillingCustomer({
        id: customer.id,
        email: customer.email || undefined,
        name: customer.name || undefined,
        metadata: customer.metadata,
      })
    }

    // Prepare line items
    const lineItems = [
      {
        price: productConfig.priceId,
        quantity: 1,
      },
    ]

    lineItems.push({price: onboardingConfig.priceId, quantity: 1})

    const session = await billing.createCheckoutSession({
      mode: 'subscription',
      customer: customerId,
      line_items: lineItems,
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://portals.works'}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://portals.works'}/checkout/canceled`,
      metadata: {
        product_type: 'production-team',
        billing_cadence: cadence,
        installment_count: cadence === 'quarterly' ? String(installmentSchedule?.count || '') : '',
        include_onboarding: 'true',
      },
    })

    await createBillingCheckoutSession({
      id: session.id,
      customerId: customerId || undefined,
      productType: 'production-team',
      status: session.status || 'unknown',
      metadata: {
        ...session.metadata,
        amount: String(cadence === 'quarterly' ? annualAmount / Number(installmentSchedule?.count) : annualAmount),
        currency: packageSpec.price?.currency || '',
        annual_term_amount: String(annualAmount),
        onboarding_amount: String(onboardingFee),
        billing_cadence: cadence,
        include_onboarding: 'true',
      },
    })

    return NextResponse.json({
      ok: true,
      url: session.url,
      sessionId: session.id,
    })
  } catch (error) {
    console.error('Production Team checkout error:', error)
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : 'Checkout failed',
      },
      {status: 500},
    )
  }
}
