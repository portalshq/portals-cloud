import {NextResponse} from 'next/server'
import Stripe from 'stripe'
import {applyTransition} from '@/lib/leads/pilot'
import {
  enqueuePilotEmail,
  getPilotByPaymentSession,
  getPilotById,
  leadsDryRun,
  updatePilot,
  createBillingCustomer,
  createBillingSubscription,
  createBillingInvoice,
  createBillingPayment,
  getBillingSubscription,
} from '@/lib/leads/store'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<NextResponse> {
  const secretKey = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secretKey || !webhookSecret || leadsDryRun()) {
    return NextResponse.json({received: true})
  }
  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({error: 'missing signature'}, {status: 400})
  }
  const rawBody = await request.text()
  let event: Stripe.Event
  try {
    const stripe = new Stripe(secretKey)
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (cause) {
    return NextResponse.json(
      {error: cause instanceof Error ? cause.message : 'invalid signature'},
      {status: 400},
    )
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.payment_status !== 'paid') {
      return NextResponse.json({received: true})
    }
    const pilotId = session.metadata?.pilotId || session.client_reference_id
    const sessionId = session.id
    if (sessionId) {
      const bySession = await getPilotByPaymentSession(sessionId)
      const pilot = bySession || (pilotId ? await getPilotById(pilotId) : null)
      if (pilot) {
        const transition = applyTransition(pilot.state, 'pay')
        if (transition.allowed) {
          await updatePilot(pilot.id, {
            state: 'paid',
            payment: {
              ...(pilot.payment || {}),
              sessionId,
              paidAt: new Date().toISOString(),
            },
            historyNote: `payment received (${session.amount_total ? `$${(session.amount_total / 100).toLocaleString('en-US')}` : 'confirmed'})`,
          })
          await enqueuePilotEmail(pilot.id, 'paid')
        }
      }
    }
  }

  // Handle subscription creation
  if (event.type === 'customer.subscription.created') {
    const subscription = event.data.object as Stripe.Subscription
    const subscriptionItem = subscription.items.data[0]
    const price = subscriptionItem?.price
    await createBillingSubscription({
      id: subscription.id,
      customerId: subscription.customer as string,
      productType: (subscription.metadata.product_type as any) || 'production-team',
      status: subscription.status as any,
      currentPeriodStart: new Date((subscription as any).current_period_start * 1000),
      currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
      metadata: {
        ...subscription.metadata,
        price_id: price?.id,
        amount: price?.unit_amount,
        currency: price?.currency,
      },
    })
  }

  // Handle subscription updates
  if (event.type === 'customer.subscription.updated') {
    const subscription = event.data.object as Stripe.Subscription
    const existing = await getBillingSubscription(subscription.id)
    if (existing) {
      const subscriptionItem = subscription.items.data[0]
      const price = subscriptionItem?.price
      await createBillingSubscription({
        id: subscription.id,
        customerId: subscription.customer as string,
        productType: (subscription.metadata.product_type as any) || existing.productType,
        status: subscription.status as any,
        currentPeriodStart: new Date((subscription as any).current_period_start * 1000),
        currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
        metadata: {
          ...subscription.metadata,
          price_id: price?.id,
          amount: price?.unit_amount,
          currency: price?.currency,
        },
      })
    }
  }

  // Handle successful invoice payments
  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object as Stripe.Invoice
    await createBillingInvoice({
      id: invoice.id,
      subscriptionId: (invoice as any).subscription ? String((invoice as any).subscription) : undefined,
      customerId: invoice.customer as string,
      status: invoice.status as any,
      amount: invoice.amount_paid,
      currency: invoice.currency,
      dueDate: (invoice as any).due_date ? new Date((invoice as any).due_date * 1000) : undefined,
      paidAt: (invoice as any).status_transitions?.paid_at ? new Date((invoice as any).status_transitions.paid_at * 1000) : undefined,
      metadata: invoice.metadata as Record<string, unknown>,
    })
  }

  // Handle failed invoice payments
  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice
    await createBillingInvoice({
      id: invoice.id,
      subscriptionId: (invoice as any).subscription ? String((invoice as any).subscription) : undefined,
      customerId: invoice.customer as string,
      status: invoice.status as any,
      amount: invoice.amount_due,
      currency: invoice.currency,
      dueDate: (invoice as any).due_date ? new Date((invoice as any).due_date * 1000) : undefined,
      paidAt: undefined,
      metadata: invoice.metadata as Record<string, unknown>,
    })
  }

  // Handle payment intents (for one-time payments)
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent
    await createBillingPayment({
      id: paymentIntent.id,
      invoiceId: (paymentIntent as any).invoice ? String((paymentIntent as any).invoice) : undefined,
      customerId: paymentIntent.customer as string,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: paymentIntent.status,
      productType: (paymentIntent.metadata.product_type as any) || undefined,
      metadata: paymentIntent.metadata as Record<string, unknown>,
    })
  }

  return NextResponse.json({received: true})
}
