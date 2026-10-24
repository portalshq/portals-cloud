import {headers} from 'next/headers'
import {NextResponse} from 'next/server'
import type Stripe from 'stripe'
import {createStripePlatformClient} from '@portalshq/platform-billing'
import {getPilotById, leadsDryRun, mutatePilot} from '@/lib/leads/store'
import {notifyPilotRoomEvent} from '@/lib/leads/pilot-room-notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<NextResponse> {
  const body = await request.text()
  const signature = (await headers()).get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ok: false, message: 'Missing stripe-signature header'}, {status: 400})
  }

  const secretKey = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (leadsDryRun() || !secretKey || !webhookSecret) {
    console.log('[pilot webhook] Skipping webhook in dry-run mode or missing credentials')
    return NextResponse.json({ok: true})
  }

  const stripe = createStripePlatformClient(secretKey)
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (cause) {
    console.error('[pilot webhook] Signature verification failed', cause)
    return NextResponse.json({ok: false, message: 'Invalid signature'}, {status: 400})
  }

  // Handle checkout.session.completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const pilotId = session.metadata?.pilotId

    if (!pilotId) {
      console.error('[pilot webhook] Missing pilotId in session metadata')
      return NextResponse.json({ok: false, message: 'Missing pilotId'}, {status: 400})
    }

    const pilot = await getPilotById(pilotId)
    if (!pilot) {
      console.error(`[pilot webhook] Pilot not found: ${pilotId}`)
      return NextResponse.json({ok: false, message: 'Pilot not found'}, {status: 404})
    }

    // Verify the session matches the pilot's stored sessionId
    if (pilot.payment?.sessionId !== session.id) {
      console.error(`[pilot webhook] Session ID mismatch for pilot ${pilotId}`)
      return NextResponse.json({ok: false, message: 'Session ID mismatch'}, {status: 400})
    }

    try {
      const {pilot: updated} = await mutatePilot(pilotId, (existing) => {
        if (existing.state === 'paid' || existing.state === 'launch') {
          return {result: existing}
        }
        return {
          patch: {
            state: 'paid' as const,
            payment: {
              ...(existing.payment || {}),
              paymentStatus: 'paid',
              paidAt: new Date().toISOString(),
            },
            historyNote: 'Payment completed via Stripe checkout',
          },
          result: existing,
        }
      })

      await notifyPilotRoomEvent({
        pilot: updated,
        event: 'paid',
        eventKey: `paid:${updated.version}:webhook:${session.id}`,
      })

      console.log(`[pilot webhook] Pilot ${pilotId} marked as paid`)
      return NextResponse.json({ok: true})
    } catch (cause) {
      console.error(`[pilot webhook] Failed to update pilot ${pilotId}`, cause)
      return NextResponse.json({ok: false, message: 'Failed to update pilot'}, {status: 500})
    }
  }

  // Handle invoice.payment_succeeded event
  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object as Stripe.Invoice
    const pilotId = invoice.metadata?.pilotId

    if (!pilotId) {
      console.error('[pilot webhook] Missing pilotId in invoice metadata')
      return NextResponse.json({ok: false, message: 'Missing pilotId'}, {status: 400})
    }

    const pilot = await getPilotById(pilotId)
    if (!pilot) {
      console.error(`[pilot webhook] Pilot not found: ${pilotId}`)
      return NextResponse.json({ok: false, message: 'Pilot not found'}, {status: 404})
    }

    try {
      const {pilot: updated} = await mutatePilot(pilotId, (existing) => {
        if (existing.state === 'paid' || existing.state === 'launch') {
          return {result: existing}
        }
        return {
          patch: {
            state: 'paid' as const,
            payment: {
              ...(existing.payment || {}),
              paymentStatus: 'paid',
              invoiceStatus: 'paid',
              paidAt: new Date().toISOString(),
            },
            historyNote: 'Invoice payment completed',
          },
          result: existing,
        }
      })

      await notifyPilotRoomEvent({
        pilot: updated,
        event: 'paid',
        eventKey: `paid:${updated.version}:webhook:invoice:${invoice.id}`,
      })

      console.log(`[pilot webhook] Pilot ${pilotId} marked as paid via invoice`)
      return NextResponse.json({ok: true})
    } catch (cause) {
      console.error(`[pilot webhook] Failed to update pilot ${pilotId}`, cause)
      return NextResponse.json({ok: false, message: 'Failed to update pilot'}, {status: 500})
    }
  }

  // Return 200 for other events to avoid Stripe retries
  return NextResponse.json({ok: true})
}
