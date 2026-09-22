import {cookies} from 'next/headers'
import {NextResponse} from 'next/server'
import {createStripePlatformBilling, createStripePlatformClient} from '@portalshq/billing'
import {APP_SESSION_COOKIE, currentApplicationUser, pilotMembershipWithAccountRole, linkPilotStripeCustomer} from '@/lib/leads/application-auth'
import {hasPendingMaterialException} from '@/lib/leads/pilot'
import {createBillingCustomer, getPilotById, leadsDryRun, mutatePilot} from '@/lib/leads/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function cookieValue(request: Request, name: string): string | undefined {
  return request.headers.get('cookie')?.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1)
}

export async function POST(
  request: Request,
  {params}: {params: Promise<{id: string}>},
): Promise<NextResponse> {
  const {id} = await params
  const pilot = await getPilotById(id)
  if (!pilot) return NextResponse.json({ok: false, message: 'pilot record not found'}, {status: 404})
  const user = await currentApplicationUser(cookieValue(request, APP_SESSION_COOKIE) || (await cookies()).get(APP_SESSION_COOKIE)?.value)
  const {pilotRole, accountRole, customerAccountId} = user ? await pilotMembershipWithAccountRole(id, user.id) : {pilotRole: null, accountRole: null, customerAccountId: null}
  if (!user || pilotRole !== 'owner' || accountRole !== 'owner') return NextResponse.json({ok: false, message: 'only the account owner can issue the invoice'}, {status: 403})
  if (hasPendingMaterialException(pilot.exceptions)) {
    return NextResponse.json({ok: false, code: 'material_exception', message: 'invoice creation is unavailable until the flagged pilot exception is resolved'}, {status: 422})
  }
  if (pilot.state !== 'signed' && pilot.state !== 'launch') return NextResponse.json({ok: false, message: 'the pilot must be signed before an invoice can be issued'}, {status: 400})

  const existingInvoice = String(pilot.payment?.invoiceId || '')
  if (existingInvoice) {
    return NextResponse.json({ok: true, invoiceId: existingInvoice, hostedInvoiceUrl: pilot.payment.hostedInvoiceUrl, invoicePdf: pilot.payment.invoicePdf, pilot})
  }

  const secretKey = process.env.STRIPE_SECRET_KEY
  if (leadsDryRun() || !secretKey) {
    const {pilot: updated} = await mutatePilot(id, (current) => ({
      patch: {
        payment: {...current.payment, invoiceId: `sim_invoice_${id}`, invoiceStatus: 'open', paymentMethod: 'invoice', paymentStatus: 'processing', issuedAt: new Date().toISOString()},
        historyNote: 'invoice issued (simulated)',
        by: user.email,
      },
      result: undefined,
    }))
    return NextResponse.json({ok: true, invoiceId: updated.payment.invoiceId, pilot: updated})
  }

  const billing = createStripePlatformBilling(secretKey)
  const email = String(pilot.signing?.email || pilot.answers.email || user.email)
  const name = String(pilot.signing?.name || pilot.answers.name || '')
  try {
    const {customer, created} = await billing.findOrCreateCustomer({email, name, metadata: {pilotId: id, productType: 'production-pilot'}})
    if (created) await createBillingCustomer({id: customer.id, email: customer.email || email, name: customer.name || name, metadata: customer.metadata})
    await linkPilotStripeCustomer(id, customer.id)
    const stripe = createStripePlatformClient(secretKey)
    const amount = Math.round((pilot.proposal?.priceAmount || Number(process.env.PILOT_PRICE_AMOUNT) || 5000) * 100)
    const currency = String(pilot.proposal?.currency || 'USD').toLowerCase()
    await stripe.invoiceItems.create({customer: customer.id, amount, currency, description: `Portals production pilot — ${pilot.proposal?.termDays || 21} days`}, {idempotencyKey: `pilot-invoice-item:${id}`})
    const invoice = await stripe.invoices.create({
      customer: customer.id,
      collection_method: 'send_invoice',
      days_until_due: Number(process.env.PILOT_INVOICE_DAYS_UNTIL_DUE || 7),
      metadata: {pilotId: id, productType: 'production-pilot', offer: String(pilot.proposal?.offerVariantSlug || '')},
      description: 'Portals production pilot',
    }, {idempotencyKey: `pilot-invoice:${id}`})
    const finalized = await stripe.invoices.finalizeInvoice(invoice.id, {}, {idempotencyKey: `pilot-invoice-finalize:${id}`})
    const sent = await stripe.invoices.sendInvoice(finalized.id)
    const {pilot: updated} = await mutatePilot(id, (current) => ({
      patch: {
        payment: {
          ...current.payment,
          invoiceId: sent.id,
          invoiceStatus: sent.status || 'open',
          hostedInvoiceUrl: sent.hosted_invoice_url || undefined,
          invoicePdf: sent.invoice_pdf || undefined,
          paymentMethod: 'invoice',
          paymentStatus: 'processing',
          issuedAt: new Date().toISOString(),
          dueDate: sent.due_date ? new Date(sent.due_date * 1000).toISOString() : undefined,
        },
        historyNote: 'invoice issued',
        by: user.email,
      },
      result: undefined,
    }))
    return NextResponse.json({ok: true, invoiceId: sent.id, hostedInvoiceUrl: sent.hosted_invoice_url, invoicePdf: sent.invoice_pdf, pilot: updated})
  } catch (cause) {
    return NextResponse.json({ok: false, message: cause instanceof Error ? cause.message : 'could not issue invoice'}, {status: 502})
  }
}
