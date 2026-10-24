import {after} from 'next/server'
import type Stripe from 'stripe'
import {applyTransition} from './pilot'
import {leadsDryRun, mutatePilot, type StoredPilot} from './store'
import {linkPilotStripeCustomer} from './application-auth'
import {enqueueCrmEvent, processCrmOutbox} from './crm-events'
import {notifyPilotRoomEvent} from './pilot-room-notifications'

/**
 * Applies the signed/launch -> paid transition after a completed Stripe
 * checkout and fires the paid side-effects. Shared by the Stripe webhook and
 * the checkout-session reconcile path so a confirmed payment resolves
 * identically regardless of webhook delivery. Idempotent: the `pay`
 * transition gates the write and `eventKey` dedupes notifications.
 * `recorded` is false when the pilot cannot be paid and is not already paid.
 */
export async function recordPilotCheckoutPaid(
  pilot: StoredPilot,
  session: Pick<Stripe.Checkout.Session, 'id' | 'amount_total' | 'customer'>,
  eventKey: string,
): Promise<{pilot: StoredPilot; recorded: boolean}> {
  await linkPilotStripeCustomer(
    pilot.id,
    typeof session.customer === 'string'
      ? session.customer
      : (session.customer as Stripe.Customer | null)?.id,
  )
  let updated = pilot
  if (applyTransition(pilot.state, 'pay').allowed) {
    const res = await mutatePilot(pilot.id, (existing) => {
      if (!applyTransition(existing.state, 'pay').allowed) return {result: existing}
      return {
        patch: {
          state: existing.state === 'launch' ? ('launch' as const) : ('paid' as const),
          payment: {
            ...(existing.payment || {}),
            sessionId: session.id,
            paymentMethod: 'card',
            paymentStatus: 'paid',
            paidAt: new Date().toISOString(),
          },
          historyNote: `payment received (${
            session.amount_total
              ? `$${(session.amount_total / 100).toLocaleString('en-US')}`
              : 'confirmed'
          })`,
        },
        result: existing,
      }
    })
    updated = res.pilot
  } else if (pilot.state !== 'paid' && pilot.state !== 'launch') {
    return {pilot, recorded: false}
  }
  await notifyPilotRoomEvent({
    pilot: updated,
    event: 'paid',
    eventKey,
  })
  await enqueueCrmEvent({
    sourceType: 'pilot',
    sourceId: pilot.id,
    eventType: 'pilot_paid',
    eventKey: `${eventKey}:apollo-paid`,
  })
  if (!leadsDryRun()) after(() => processCrmOutbox(10))
  return {pilot: updated, recorded: true}
}

/**
 * Applies the signed/launch -> paid transition after a Stripe invoice is
 * paid. Shared by the Stripe webhook and the invoice reconcile path; the
 * state guard makes replays a no-op. `recorded` is false when the pilot was
 * not in a payable state.
 */
export async function recordPilotInvoicePaid(
  pilot: StoredPilot,
  invoice: Pick<Stripe.Invoice, 'id'>,
  eventKey: string,
): Promise<{pilot: StoredPilot; recorded: boolean}> {
  const {pilot: updated} = await mutatePilot(pilot.id, (current) => {
    if (!['signed', 'launch'].includes(current.state)) return {result: current}
    return {
      patch: {
        state: current.state === 'launch' ? ('launch' as const) : ('paid' as const),
        payment: {
          ...(current.payment || {}),
          invoiceId: invoice.id,
          invoiceStatus: 'paid',
          paidAt: new Date().toISOString(),
          paymentMethod: 'invoice',
          paymentStatus: 'paid',
        },
        historyNote: 'invoice payment received',
      },
      result: current,
    }
  })
  const recorded = updated.state === 'paid' || Boolean(updated.payment?.paidAt)
  if (recorded) {
    await notifyPilotRoomEvent({pilot: updated, event: 'paid', eventKey})
  }
  return {pilot: updated, recorded}
}
