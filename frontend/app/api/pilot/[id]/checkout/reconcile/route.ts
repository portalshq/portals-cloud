import {NextResponse} from 'next/server'
import {cookies} from 'next/headers'
import {createStripePlatformClient} from '@portalshq/platform-billing'
import {
  APP_SESSION_COOKIE,
  currentApplicationUser,
  pilotMembershipWithAccountRole,
} from '@/lib/leads/application-auth'
import {
  recordPilotCheckoutPaid,
  recordPilotInvoicePaid,
} from '@/lib/leads/pilot-payments'
import {getPilotById, leadsDryRun} from '@/lib/leads/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Reconciles an in-flight Stripe payment against the Stripe API. The webhook
 * remains the durable paid signal, but this endpoint lets the room verify the
 * stored checkout session (or invoice) directly after the customer returns —
 * covering deployments where webhook delivery is delayed or unavailable
 * (local development without `stripe listen`, retries in flight). It never
 * trusts client input: only the session/invoice ids already persisted by the
 * checkout and invoice routes are looked up.
 */
async function sessionTokenFromRequest(request: Request): Promise<string | undefined> {
  const match = request.headers
    .get('cookie')
    ?.match(new RegExp(`(?:^|;\\s*)${APP_SESSION_COOKIE}=([^;]+)`))
  if (match?.[1]) return match[1]
  try {
    return (await cookies()).get(APP_SESSION_COOKIE)?.value
  } catch {
    return undefined
  }
}

export async function POST(
  request: Request,
  {params}: {params: Promise<{id: string}>},
): Promise<NextResponse> {
  const {id} = await params
  const pilot = await getPilotById(id)
  if (!pilot) {
    return NextResponse.json({ok: false, message: 'pilot record not found'}, {status: 404})
  }
  const user = await currentApplicationUser(await sessionTokenFromRequest(request))
  const {pilotRole, accountRole} = user
    ? await pilotMembershipWithAccountRole(pilot.id, user.id)
    : {pilotRole: null, accountRole: null}
  if (!pilotRole || !['owner', 'signer'].includes(pilotRole) || accountRole !== 'owner') {
    return NextResponse.json(
      {ok: false, message: 'only the account owner or signer can reconcile payment'},
      {status: 403},
    )
  }
  // Already paid -> idempotent success.
  if (pilot.state === 'paid' || (pilot.state === 'launch' && pilot.payment?.paidAt)) {
    return NextResponse.json({ok: true, paid: true, pilot})
  }
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (leadsDryRun() || !secretKey) {
    return NextResponse.json({ok: true, paid: false, reconciled: 'unavailable', pilot})
  }
  const stripe = createStripePlatformClient(secretKey)

  const sessionId = String(pilot.payment?.sessionId || '')
  if (sessionId) {
    let session
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId)
    } catch (cause) {
      console.error(
        `[pilot-checkout-reconcile] session retrieve failed pilot=${pilot.id} session=${sessionId}:`,
        cause,
      )
      return NextResponse.json(
        {ok: false, message: 'could not verify the Stripe checkout session'},
        {status: 502},
      )
    }
    if (session.payment_status === 'paid') {
      try {
        const {pilot: updated, recorded} = await recordPilotCheckoutPaid(
          pilot,
          session,
          `paid:reconcile:${sessionId}`,
        )
        console.log(
          `[pilot-checkout-reconcile] session paid pilot=${pilot.id} session=${sessionId} recorded=${recorded} state=${updated.state}`,
        )
        return NextResponse.json({ok: true, paid: true, pilot: updated})
      } catch (cause) {
        console.error(
          `[pilot-checkout-reconcile] paid finalization failed pilot=${pilot.id} session=${sessionId}:`,
          cause,
        )
        return NextResponse.json(
          {ok: false, message: 'payment verification succeeded but recording failed'},
          {status: 500},
        )
      }
    }
    console.log(
      `[pilot-checkout-reconcile] session not yet paid pilot=${pilot.id} session=${sessionId} status=${session.payment_status}`,
    )
    return NextResponse.json({ok: true, paid: false, status: session.payment_status, pilot})
  }

  const invoiceId = String(pilot.payment?.invoiceId || '')
  if (invoiceId) {
    let invoice
    try {
      invoice = await stripe.invoices.retrieve(invoiceId)
    } catch (cause) {
      console.error(
        `[pilot-checkout-reconcile] invoice retrieve failed pilot=${pilot.id} invoice=${invoiceId}:`,
        cause,
      )
      return NextResponse.json(
        {ok: false, message: 'could not verify the Stripe invoice'},
        {status: 502},
      )
    }
    if (invoice.status === 'paid') {
      try {
        const {pilot: updated, recorded} = await recordPilotInvoicePaid(
          pilot,
          invoice,
          `invoice-paid:reconcile:${invoiceId}`,
        )
        console.log(
          `[pilot-checkout-reconcile] invoice paid pilot=${pilot.id} invoice=${invoiceId} recorded=${recorded} state=${updated.state}`,
        )
        return NextResponse.json({ok: true, paid: true, pilot: updated})
      } catch (cause) {
        console.error(
          `[pilot-checkout-reconcile] invoice finalization failed pilot=${pilot.id} invoice=${invoiceId}:`,
          cause,
        )
        return NextResponse.json(
          {ok: false, message: 'payment verification succeeded but recording failed'},
          {status: 500},
        )
      }
    }
    console.log(
      `[pilot-checkout-reconcile] invoice not yet paid pilot=${pilot.id} invoice=${invoiceId} status=${invoice.status}`,
    )
    return NextResponse.json({ok: true, paid: false, status: invoice.status, pilot})
  }

  return NextResponse.json({ok: true, paid: false, pilot})
}
