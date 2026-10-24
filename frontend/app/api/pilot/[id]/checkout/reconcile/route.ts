import {NextResponse} from 'next/server'
import {cookies} from 'next/headers'
import {createStripePlatformClient} from '@portalshq/platform-billing'
import {
  APP_SESSION_COOKIE,
  currentApplicationUser,
  pilotMembershipWithAccountRole,
} from '@/lib/leads/application-auth'
import {reconcileStoredPilotPayment} from '@/lib/leads/pilot-payments'
import {getPilotById, leadsDryRun} from '@/lib/leads/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

/**
 * Reconciles every in-flight Stripe payment instrument on the pilot against
 * the Stripe API. The webhook remains the durable paid signal, but this
 * endpoint lets the room verify the stored checkout session and issued
 * invoice directly after the customer returns — covering deployments where
 * webhook delivery is delayed or unavailable (local development without
 * `stripe listen`, retries in flight). It never trusts client input: only
 * the ids already persisted by the checkout and invoice routes are looked
 * up, so a customer who started both payment paths resolves through
 * whichever one Stripe reports as paid.
 */
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
  try {
    const result = await reconcileStoredPilotPayment(stripe, pilot)
    if (!result.retrieved) {
      return NextResponse.json(
        {ok: false, message: 'could not verify the Stripe payment status'},
        {status: 502},
      )
    }
    return NextResponse.json({
      ok: true,
      paid: result.paid,
      sessionStatus: result.sessionStatus,
      invoiceStatus: result.invoiceStatus,
      pilot: result.pilot,
    })
  } catch (cause) {
    console.error(`[pilot-checkout-reconcile] reconciliation failed pilot=${pilot.id}:`, cause)
    return NextResponse.json(
      {ok: false, message: 'payment verification succeeded but recording failed'},
      {status: 500},
    )
  }
}
