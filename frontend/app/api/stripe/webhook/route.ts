import {after, NextResponse} from 'next/server'
import type Stripe from 'stripe'
import {createStripePlatformBilling, createStripePlatformClient} from '@portalshq/billing'
import {applyTransition} from '@/lib/leads/pilot'
import {
  createBillingCustomer,
  createBillingInvoice,
  createBillingPayment,
  createBillingSubscription,
  getBillingCustomer,
  getBillingSubscription,
  getPilotById,
  getPilotByPaymentSession,
  leadsDryRun,
  mutatePilot,
} from '@/lib/leads/store'
import {enqueueCrmEvent, processCrmOutbox} from '@/lib/leads/crm-events'
import {linkPilotStripeCustomer} from '@/lib/leads/application-auth'
import {notifyPilotRoomEvent} from '@/lib/leads/pilot-room-notifications'

export const runtime = 'nodejs'

async function ensureBillingCustomerExists(
  customerId: string | null | undefined,
  secretKey: string,
): Promise<void> {
  if (!customerId) return
  const existing = await getBillingCustomer(customerId)
  if (existing) return
  try {
    const stripe = createStripePlatformClient(secretKey)
    const customer = await stripe.customers.retrieve(customerId)
    if (customer && 'deleted' in customer && !customer.deleted) {
      await createBillingCustomer({
        id: customer.id,
        email: customer.email || undefined,
        name: customer.name || undefined,
        metadata: (customer.metadata as Record<string, unknown>) || {},
      })
    } else {
      await createBillingCustomer({id: customerId, metadata: {}})
    }
  } catch {
    try {
      await createBillingCustomer({id: customerId, metadata: {placeholder: true}})
    } catch {}
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const secretKey = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (leadsDryRun()) {
    return NextResponse.json({received: true})
  }
  if (!secretKey || !webhookSecret) {
    console.error('Stripe webhook misconfigured: missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET')
    return NextResponse.json({error: 'webhook not configured'}, {status: 500})
  }
  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({error: 'missing signature'}, {status: 400})
  }
  const rawBody = await request.text()
  let event: Stripe.Event
  try {
    const billing = createStripePlatformBilling(secretKey)
    event = billing.constructWebhookEvent(rawBody, signature, webhookSecret)
  } catch (cause) {
    return NextResponse.json(
      {error: cause instanceof Error ? cause.message : 'invalid signature'},
      {status: 400},
    )
  }

  // Pilot payment: handle both sync and async success
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.payment_status !== 'paid' && event.type === 'checkout.session.completed') {
      return NextResponse.json({received: true})
    }
    const pilotId = session.metadata?.pilotId || session.client_reference_id
    const sessionId = session.id
    if (sessionId) {
      try {
        const bySession = await getPilotByPaymentSession(sessionId)
        const pilot = bySession || (pilotId ? await getPilotById(pilotId) : null)
        if (pilot) {
          await linkPilotStripeCustomer(
            pilot.id,
            typeof session.customer === 'string' ? session.customer : (session.customer as Stripe.Customer | null)?.id,
          )
          let updated = pilot
          const allowed = applyTransition(pilot.state, 'pay').allowed
          if (allowed) {
            const res = await mutatePilot(pilot.id, (existing) => {
              if (!applyTransition(existing.state, 'pay').allowed) return {result: existing}
              return {
                patch: {
                  state: 'paid' as const,
                  payment: {
                    ...(existing.payment || {}),
                    sessionId,
                    paidAt: new Date().toISOString(),
                  },
                  historyNote: `payment received (${session.amount_total ? `$${(session.amount_total / 100).toLocaleString('en-US')}` : 'confirmed'})`,
                },
                result: existing,
              }
            })
            updated = res.pilot
          } else if (pilot.state !== 'paid') {
            // Not pay-able and not already paid -> ignore
            return NextResponse.json({received: true})
          }
          // Side-effects are idempotent via eventKey + ON CONFLICT
          await notifyPilotRoomEvent({
            pilot: updated,
            event: 'paid',
            eventKey: `paid:${event.id}`,
          })
          await enqueueCrmEvent({
            sourceType: 'pilot',
            sourceId: pilot.id,
            eventType: 'pilot_paid',
            eventKey: `stripe:${event.id}:apollo-paid`,
          })
          after(() => processCrmOutbox(10))
        }
      } catch (error) {
        console.error('Pilot webhook handling failed:', error)
        return NextResponse.json({error: 'pilot handling failed'}, {status: 500})
      }
    }
    if (event.type === 'checkout.session.async_payment_succeeded') {
      return NextResponse.json({received: true})
    }
  }
  if (event.type === 'checkout.session.async_payment_failed') {
    console.warn('Stripe async payment failed:', (event.data.object as Stripe.Checkout.Session).id)
    return NextResponse.json({received: true})
  }

  // Handle subscription creation
  if (event.type === 'customer.subscription.created') {
    const subscription = event.data.object as Stripe.Subscription
    const customerId = subscription.customer as string
    try {
      await ensureBillingCustomerExists(customerId, secretKey)
      const subscriptionItem = subscription.items.data[0]
      const price = subscriptionItem?.price
      await createBillingSubscription({
        id: subscription.id,
        customerId,
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
    } catch (error) {
      console.error('Subscription created handling failed:', error)
      return NextResponse.json({error: 'subscription handling failed'}, {status: 500})
    }
  }

  // Handle subscription updates and deletions (idempotent upsert)
  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription
    const customerId = subscription.customer as string
    try {
      await ensureBillingCustomerExists(customerId, secretKey)
      const existing = await getBillingSubscription(subscription.id)
      const subscriptionItem = subscription.items.data[0]
      const price = subscriptionItem?.price
      await createBillingSubscription({
        id: subscription.id,
        customerId,
        productType: (subscription.metadata.product_type as any) || existing?.productType || 'production-team',
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
    } catch (error) {
      console.error('Subscription update handling failed:', error)
      return NextResponse.json({error: 'subscription handling failed'}, {status: 500})
    }
  }

  // Handle successful invoice payments
  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object as Stripe.Invoice
    const customerId = invoice.customer as string
    try {
      await ensureBillingCustomerExists(customerId, secretKey)
      await createBillingInvoice({
        id: invoice.id,
        subscriptionId: (invoice as any).subscription ? String((invoice as any).subscription) : undefined,
        customerId,
        status: invoice.status as any,
        amount: invoice.amount_paid,
        currency: invoice.currency,
        dueDate: (invoice as any).due_date ? new Date((invoice as any).due_date * 1000) : undefined,
        paidAt: (invoice as any).status_transitions?.paid_at ? new Date((invoice as any).status_transitions.paid_at * 1000) : undefined,
        metadata: invoice.metadata as Record<string, unknown>,
      })
    } catch (error) {
      console.error('Invoice succeeded handling failed:', error)
      return NextResponse.json({error: 'invoice handling failed'}, {status: 500})
    }
  }

  // Handle failed invoice payments
  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice
    const customerId = invoice.customer as string
    try {
      await ensureBillingCustomerExists(customerId, secretKey)
      await createBillingInvoice({
        id: invoice.id,
        subscriptionId: (invoice as any).subscription ? String((invoice as any).subscription) : undefined,
        customerId,
        status: invoice.status as any,
        amount: invoice.amount_due,
        currency: invoice.currency,
        dueDate: (invoice as any).due_date ? new Date((invoice as any).due_date * 1000) : undefined,
        paidAt: undefined,
        metadata: invoice.metadata as Record<string, unknown>,
      })
    } catch (error) {
      console.error('Invoice failed handling failed:', error)
      return NextResponse.json({error: 'invoice handling failed'}, {status: 500})
    }
  }

  // Handle payment intents (for one-time payments)
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent
    const customerId = paymentIntent.customer as string | null
    // Pilot payments may have no customer (customer_email flow); skip billing table if none, pilot already tracked via session
    if (!customerId) {
      // Still record with placeholder customer if we can infer from metadata? Better to skip to avoid FK violation
      console.warn('payment_intent.succeeded without customer, skipping billing_payment:', paymentIntent.id)
      return NextResponse.json({received: true})
    }
    try {
      await ensureBillingCustomerExists(customerId, secretKey)
      await createBillingPayment({
        id: paymentIntent.id,
        invoiceId: (paymentIntent as any).invoice ? String((paymentIntent as any).invoice) : undefined,
        customerId,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
        productType: (paymentIntent.metadata.product_type as any) || undefined,
        metadata: paymentIntent.metadata as Record<string, unknown>,
      })
    } catch (error) {
      console.error('PaymentIntent handling failed:', error)
      return NextResponse.json({error: 'payment handling failed'}, {status: 500})
    }
  }
  if (event.type === 'payment_intent.payment_failed') {
    console.warn('Stripe payment failed:', (event.data.object as Stripe.PaymentIntent).id)
    return NextResponse.json({received: true})
  }

  return NextResponse.json({received: true})
}
