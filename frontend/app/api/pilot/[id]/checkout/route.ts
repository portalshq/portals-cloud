import {NextResponse} from 'next/server'
import Stripe from 'stripe'
import {verifyRoomToken} from '@/lib/leads/pilot-tokens'
import {applyTransition} from '@/lib/leads/pilot'
import {siteUrl} from '@/lib/leads/email'
import {
  enqueuePilotEmail,
  getPilotById,
  leadsDryRun,
  updatePilot,
} from '@/lib/leads/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type CheckoutBody = {
  token: string
}

export async function POST(
  request: Request,
  {params}: {params: Promise<{id: string}>},
): Promise<NextResponse> {
  const {id} = await params
  let body: CheckoutBody
  try {
    body = (await request.json()) as CheckoutBody
  } catch {
    return NextResponse.json({ok: false, message: 'invalid request body'}, {status: 400})
  }
  if (!body.token) {
    return NextResponse.json({ok: false, message: 'token is required'}, {status: 400})
  }
  const token = verifyRoomToken(body.token)
  if (!token || token.pilotId !== id) {
    return NextResponse.json({ok: false, message: 'invalid or expired room link'}, {status: 401})
  }

  const pilot = await getPilotById(id)
  if (!pilot) {
    return NextResponse.json({ok: false, message: 'pilot record not found'}, {status: 404})
  }
  if (!applyTransition(pilot.state, 'pay').allowed) {
    return NextResponse.json(
      {ok: false, message: 'payment cannot be recorded in the current state'},
      {status: 400},
    )
  }

  const roomUrl = `${siteUrl()}/pilot/${id}?t=${encodeURIComponent(body.token)}`
  const secretKey = process.env.STRIPE_SECRET_KEY

  if (leadsDryRun() || !secretKey) {
    const updated = await updatePilot(id, {
      state: 'paid',
      payment: {
        ...(pilot.payment || {}),
        sessionId: `sim_${id}`,
        simulated: true,
        paidAt: new Date().toISOString(),
      },
      historyNote: `payment recorded (simulated)`,
    })
    await enqueuePilotEmail(id, 'paid')
    return NextResponse.json({ok: true, url: null, pilot: updated})
  }

  const stripe = new Stripe(secretKey)
  // Production pilot uses a custom price_data approach, not a pre-configured product
  const amount = pilot.proposal?.priceAmount || Number(process.env.PILOT_PRICE_AMOUNT) || 5000
  const currency = pilot.proposal?.currency || 'USD'

  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.create(
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
                name: `Portals paid production pilot — ${String(pilot.answers.company || '')}`,
                description: `${pilot.proposal?.termDays || 21}-day production pilot; fee credited toward the annual deployment if the order form is signed by ${pilot.proposal?.creditDeadline || 'the stated deadline'}.`,
              },
            },
          },
        ],
        success_url: `${roomUrl}&session_id={CHECKOUT_SESSION_ID}`,
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

  await updatePilot(id, {
    payment: {
      ...(pilot.payment || {}),
      sessionId: session.id,
    },
  })

  return NextResponse.json({ok: true, url: session.url})
}
