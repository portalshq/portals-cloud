import type {Metadata} from 'next'
import {CTAButton} from '@/components/CTAButton'
import {safeInternalPath} from '@/lib/leads/account-paths'

export const metadata: Metadata = {
  title: 'Checkout canceled | portals',
  description: 'Your checkout was canceled before payment completed.',
  robots: 'noindex, nofollow',
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Transactional counterpart to /checkout/success. Not a marketing page:
// intentionally excluded from sitemap + IA allowlist.
export default async function CheckoutCanceledPage({
  searchParams,
}: {
  searchParams: Promise<{next?: string}>
}) {
  const query = await searchParams
  const next = safeInternalPath(
    typeof query.next === 'string' ? query.next : undefined,
    '/pilot',
  )
  const returningToRoom = next !== '/pilot'

  return (
    <main className="min-h-screen bg-[#010528] text-white">
      <section className="ui-grid py-fluid-[76,106]">
        <div className="col-span-full max-w-3xl">
          <p className="t-p-sans uppercase tracking-[.16em] text-white/45">checkout canceled</p>
          <h1 className="t-d2-sans mt-24 max-w-5xl">payment not completed.</h1>
          <p className="t-p-lg-serif mt-32 max-w-3xl text-white/80">
            No charge was made. You can return to your pilot room and try again when ready.
          </p>
          <div className="mt-40 flex flex-wrap gap-16">
            <CTAButton href={next} analyticsLabel="checkout canceled primary">
              {returningToRoom ? 'Return to pilot room' : 'Back to paid pilot'}
            </CTAButton>
            <CTAButton href="/contact" appearance="plain" analyticsLabel="checkout canceled contact">
              contact portals
            </CTAButton>
          </div>
        </div>
      </section>
    </main>
  )
}
