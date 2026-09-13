import {NextResponse} from 'next/server'
import {cookies} from 'next/headers'
import type Stripe from 'stripe'
import {createStripePlatformBilling} from '@portalshq/billing'
import {pilotRoomPathForPilotOrFallback} from '@/lib/leads/account-paths'
import {APP_SESSION_COOKIE, currentApplicationUser, pilotMembershipRole} from '@/lib/leads/application-auth'
import {applyTransition} from '@/lib/leads/pilot'
import {siteUrl} from '@/lib/leads/email'
import {
  getPilotById,
  leadsDryRun,
  mutatePilot,
  updatePilot,
} from '@/lib/leads/store'
import {notifyPilotRoomEvent} from '@/lib/leads/pilot-room-notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  {params}: {params: Promise<{id: string}>},
): Promise<NextResponse> {
  const {id} = await params
  const pilot = await getPilotById(id)
  if (!pilot) {
    return NextResponse.json({ok: false, message: 'pilot record not found'}, {status: 404})
  }
  const user = await currentApplicationUser((await cookies()).get(APP_SESSION_COOKIE)?.value)
  const accessRole = user ? await pilotMembershipRole(pilot.id, user.id) : null
  if (!accessRole || !['owner', 'signer'].includes(accessRole)) {
    return NextResponse.json({ok: false, message: 'only the account owner or signer can start payment'}, {status: 403})
  }
  // Already paid -> idempotent success (no new session)
  if (pilot.state === 'paid') {
    return NextResponse.json({ok: true, url: null, pilot})
  }
  if (!applyTransition(pilot.state, 'pay').allowed) {
    return NextResponse.json(
      {ok: false, message: 'payment cannot be recorded in the current state'},
      {status: 400},
    )
  }

  const roomUrl = `${siteUrl()}${pilotRoomPathForPilotOrFallback(pilot)}`
  const secretKey = process.env.STRIPE_SECRET_KEY

  if (leadsDryRun() || !secretKey) {
    const {pilot: final} = await mutatePilot(id, (existing) => {
      if (existing.state === 'paid') return {result: existing}
      if (!applyTransition(existing.state, 'pay').allowed) throw new Error('payment cannot be recorded in the current state')
      return {
        patch: {
          state: 'paid' as const,
          payment: {
            ...(existing.payment || {}),
            sessionId: `sim_${id}`,
            simulated: true,
            paidAt: new Date().toISOString(),
          },
          historyNote: `payment recorded (simulated)`,
        },
        result: existing,
      }
    })
    if (final.state === 'paid') {
      await notifyPilotRoomEvent({
        pilot: final,
        event: 'paid',
        eventKey: `paid:${final.version}:simulated:${Date.now()}`,
      })
    }
    return NextResponse.json({ok: true, url: null, pilot: final})
  }

  const billing = createStripePlatformBilling(secretKey)

  // Production pilot uses a custom price_data approach, not a pre-configured product
  const amount = pilot.proposal?.priceAmount || Number(process.env.PILOT_PRICE_AMOUNT) || 5000
  const currency = pilot.proposal?.currency || 'USD'

  let session: Stripe.Checkout.Session
  try {
    session = await billing.createCheckoutSession(
      {
        mode: 'payment',
        client_reference_id: id,
        ...(pilot.signing?.email || pilot.answers.email
          ? {customer_email: String(pilot.signing.email || pilot.answers.email)}
          : {}),
        metadata: {pilotId: id, product_type: 'production-pilot'},
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency,
              unit_amount: Math.round(amount * 100),
              product_data: {
                name: `portals paid production pilot — ${String(pilot.answers.company || '')}`,
                description: `${pilot.proposal?.termDays || 21}-day production pilot; fee credited toward the annual deployment if the order form is signed by ${pilot.proposal?.creditDeadline || 'the stated deadline'}.`,
              },
            },
          },
        ],
        success_url: `${roomUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: roomUrl,
      },
      {idempotencyKey: `pilot-checkout-${id}-${pilot.signing?.signedAt || 'unsigned'}`},
    )
  } catch (cause) {
    return NextResponse.json(
      {ok: false, message: cause instanceof Error ? cause.message : 'could not start payment'},
      {status: 502},
    )
  }

  // Atomically persist sessionId without clobbering concurrent webhook paidAt
  await mutatePilot(id, (existing) => ({
    patch: {payment: {...existing.payment, sessionId: session.id}},
    result: undefined as unknown as typeof pilot,
  }))

  return NextResponse.json({ok: true, url: session.url})
}
