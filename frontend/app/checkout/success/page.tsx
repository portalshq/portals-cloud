import type {Metadata} from 'next'
import {CTAButton} from '@/components/CTAButton'
import {safeInternalPath} from '@/lib/leads/account-paths'
import {CheckoutSuccessRedirect} from './CheckoutSuccessRedirect'

export const metadata: Metadata = {
  title: 'Checkout success | portals',
  description: 'Your payment is confirmed. Return to your pilot room to schedule launch.',
  robots: 'noindex, nofollow',
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Transactional interstitial for Stripe checkouts (studio-pilot, studio-annual,
// production-team, and pilot-room checkout via ?next=<roomPath>). Not a
// marketing page: intentionally excluded from sitemap + IA allowlist.
export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{session_id?: string; next?: string}>
}) {
  const query = await searchParams
  const sessionId = typeof query.session_id === 'string' ? query.session_id : ''
  const next = safeInternalPath(
    typeof query.next === 'string' ? query.next : undefined,
    '/account',
  )
  const returningToRoom = next !== '/account'
  // Forward the Stripe session so the room can poll payment status while the
  // webhook finalizes the pilot record.
  const returnHref =
    returningToRoom && sessionId
      ? `${next}${next.includes('?') ? '&' : '?'}session_id=${encodeURIComponent(sessionId)}`
      : next

  return (
    <main className="flex min-h-screen flex-col justify-center bg-[#010528] px-24 py-120 text-white">
      <section className="mx-auto w-full max-w-3xl">
        <h1 className="t-d2-sans max-w-3xl">thank you — payment received.</h1>
        <p className="t-p-lg-serif mt-32 max-w-3xl">
          Your purchase is confirmed. {returningToRoom ? 'Returning you to your pilot room shortly.' : 'Taking you to your account shortly.'}
        </p>
        <CheckoutSuccessRedirect href={returnHref} />
        {/* {sessionId ? (
          <p className="t-p-sans mt-24 max-w-2xl text-white/80">session {sessionId}</p>
        ) : null} */}
        <div className="mt-40 flex flex-wrap gap-16">
          <CTAButton href={returnHref} analyticsLabel="checkout success primary">
            {returningToRoom ? 'Return to pilot room' : 'Go to account'}
          </CTAButton>
          {/* <CTAButton href="/contact" appearance="plain" analyticsLabel="checkout success contact">
            contact portals
          </CTAButton> */}
        </div>
      </section>
    </main>
  )
}
