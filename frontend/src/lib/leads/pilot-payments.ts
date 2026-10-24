import {after} from 'next/server'
import type Stripe from 'stripe'
import {applyTransition} from './pilot'
import {leadsDryRun, mutatePilot, type StoredPilot} from './store'
import {linkPilotStripeCustomer} from './application-auth'
import {enqueueCrmEvent, processCrmOutbox} from './crm-events'
import {notifyPilotRoomEvent} from './pilot-room-notifications'

/**
 * The minimal Stripe surface used to verify and cancel payment instruments.
 * `createStripePlatformClient` satisfies it structurally; tests inject fakes.
 */
export type StripePaymentLookup = {
  checkout: {
    sessions: {
      retrieve(id: string): Promise<
        Pick<Stripe.Checkout.Session, 'id' | 'amount_total' | 'customer' | 'payment_status'>
      >
      expire(id: string): Promise<unknown>
    }
  }
  invoices: {
    retrieve(id: string): Promise<Pick<Stripe.Invoice, 'id' | 'status'>>
    voidInvoice(id: string): Promise<unknown>
  }
}

/**
 * After one payment instrument completes, cancels the counterpart so the
 * customer cannot be charged twice. A signed pilot can have both an open
 * checkout session and an issued invoice in flight; whichever settles first
 * wins, and the other is voided/expired best-effort.
 */
async function cancelCounterpartPayment(
  stripe: StripePaymentLookup | undefined,
  pilot: StoredPilot,
  paidVia: 'card' | 'invoice',
): Promise<void> {
  if (!stripe) return
  try {
    if (paidVia === 'card') {
      const invoiceId = String(pilot.payment?.invoiceId || '')
      if (invoiceId && pilot.payment?.invoiceStatus !== 'paid') {
        await stripe.invoices.voidInvoice(invoiceId)
        console.log(`[pilot-payments] voided counterpart invoice pilot=${pilot.id} invoice=${invoiceId}`)
      }
    } else {
      const sessionId = String(pilot.payment?.sessionId || '')
      if (sessionId) {
        await stripe.checkout.sessions.expire(sessionId)
        console.log(`[pilot-payments] expired counterpart session pilot=${pilot.id} session=${sessionId}`)
      }
    }
  } catch (cause) {
    // Best effort: the counterpart may already be void, paid, or expired.
    console.warn(`[pilot-payments] counterpart cancel failed pilot=${pilot.id} via=${paidVia}:`, cause)
  }
}

/**
 * Applies the signed/launch -> paid transition after a completed Stripe
 * checkout and fires the paid side-effects. Shared by the Stripe webhook and
 * the checkout-session reconcile path so a confirmed payment resolves
 * identically regardless of webhook delivery. Idempotent: the `pay`
 * transition gates the write and `eventKey` dedupes notifications.
 * `recorded` is false when the pilot cannot be paid and is not already paid.
 * When `stripe` is provided, a still-open counterpart invoice is voided so
 * the customer cannot pay twice.
 */
export async function recordPilotCheckoutPaid(
  pilot: StoredPilot,
  session: Pick<Stripe.Checkout.Session, 'id' | 'amount_total' | 'customer'>,
  eventKey: string,
  stripe?: StripePaymentLookup,
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
  await cancelCounterpartPayment(stripe, updated, 'card')
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
 * not in a payable state. When `stripe` is provided, a still-open
 * counterpart checkout session is expired so the customer cannot pay twice.
 */
export async function recordPilotInvoicePaid(
  pilot: StoredPilot,
  invoice: Pick<Stripe.Invoice, 'id'>,
  eventKey: string,
  stripe?: StripePaymentLookup,
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
    await cancelCounterpartPayment(stripe, updated, 'invoice')
    await notifyPilotRoomEvent({pilot: updated, event: 'paid', eventKey})
  }
  return {pilot: updated, recorded}
}

export type PilotPaymentReconcileResult = {
  pilot: StoredPilot
  paid: boolean
  sessionStatus?: string
  invoiceStatus?: string
  /** True when at least one Stripe lookup returned a status. */
  retrieved: boolean
}

/**
 * Verifies every payment instrument already persisted on the pilot against
 * the Stripe API — checkout session first, then the issued invoice — and
 * records the paid transition through the same shared path as the webhook
 * for whichever instrument Stripe reports as paid. A customer can have both
 * instruments in flight, so an unpaid session must not mask a paid invoice
 * (or vice versa). Only the stored ids are looked up; client input is never
 * trusted.
 */
export async function reconcileStoredPilotPayment(
  stripe: StripePaymentLookup,
  pilot: StoredPilot,
): Promise<PilotPaymentReconcileResult> {
  if (pilot.state === 'paid' || (pilot.state === 'launch' && pilot.payment?.paidAt)) {
    return {pilot, paid: true, retrieved: true}
  }

  const result: PilotPaymentReconcileResult = {pilot, paid: false, retrieved: false}
  const sessionId = String(pilot.payment?.sessionId || '')
  if (sessionId) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId)
      result.retrieved = true
      result.sessionStatus = String(session.payment_status || '')
      if (session.payment_status === 'paid') {
        const {pilot: updated, recorded} = await recordPilotCheckoutPaid(
          pilot,
          session,
          `paid:reconcile:${sessionId}`,
          stripe,
        )
        console.log(
          `[pilot-checkout-reconcile] session paid pilot=${pilot.id} session=${sessionId} recorded=${recorded} state=${updated.state}`,
        )
        return {...result, pilot: updated, paid: true}
      }
      console.log(
        `[pilot-checkout-reconcile] session not yet paid pilot=${pilot.id} session=${sessionId} status=${session.payment_status}`,
      )
    } catch (cause) {
      console.error(
        `[pilot-checkout-reconcile] session retrieve failed pilot=${pilot.id} session=${sessionId}:`,
        cause,
      )
    }
  }

  const invoiceId = String(pilot.payment?.invoiceId || '')
  if (invoiceId) {
    try {
      const invoice = await stripe.invoices.retrieve(invoiceId)
      result.retrieved = true
      result.invoiceStatus = String(invoice.status || '')
      if (invoice.status === 'paid') {
        const {pilot: updated, recorded} = await recordPilotInvoicePaid(
          pilot,
          invoice,
          `invoice-paid:reconcile:${invoiceId}`,
          stripe,
        )
        console.log(
          `[pilot-checkout-reconcile] invoice paid pilot=${pilot.id} invoice=${invoiceId} recorded=${recorded} state=${updated.state}`,
        )
        return {...result, pilot: updated, paid: true}
      }
      console.log(
        `[pilot-checkout-reconcile] invoice not yet paid pilot=${pilot.id} invoice=${invoiceId} status=${invoice.status}`,
      )
    } catch (cause) {
      console.error(
        `[pilot-checkout-reconcile] invoice retrieve failed pilot=${pilot.id} invoice=${invoiceId}:`,
        cause,
      )
    }
  }

  return result
}
