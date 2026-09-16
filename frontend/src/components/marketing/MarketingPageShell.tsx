import type {ReactNode} from 'react'
import {CTAButton} from '@/components/CTAButton'

type Props = {
  eyebrow: string
  title: ReactNode
  lede?: ReactNode
  sub?: ReactNode
  primaryCta?: {href: string; label: string}
  secondaryCta?: {href: string; label: string}
  children?: ReactNode
}

/**
 * Single shell for marketing subpages.
 * Enforces: one H1, eyebrow + lede hierarchy, 1 primary + 1 quiet secondary CTA.
 * Use instead of per-page bespoke <header> copies.
 */
export function MarketingPageShell({
  eyebrow,
  title,
  lede,
  sub,
  primaryCta,
  secondaryCta,
  children,
}: Props) {
  return (
    <>
      <header className="mx-auto flex w-full max-w-[1600px] items-center justify-between px-sms py-20 text-white">
        <a href="/" className="t-h3-sans !font-medium">
          portals
        </a>
        <nav className="hidden gap-24 text-sm lowercase md:flex" aria-label="Marketing">
          <a href="/production-memory">production memory</a>
          <a href="/use-cases">use cases</a>
          <a href="/assessment">assess workflow</a>
          <a href="/contact">contact</a>
        </nav>
      </header>
      <main className="text-white">
        <section className="ui-grid min-h-[70vh] items-center py-80">
          <div className="col-span-full max-w-6xl">
            <p className="t-p-sans mb-24 uppercase tracking-[.16em] text-white/45">{eyebrow}</p>
            <h1 className="t-d2-sans max-w-5xl">{title}</h1>
            {lede ? <p className="t-p-lg-serif mt-32 max-w-3xl text-white/80">{lede}</p> : null}
            {sub ? <p className="t-p-sans mt-24 max-w-2xl text-white/65">{sub}</p> : null}
            {primaryCta || secondaryCta ? (
              <div className="mt-40 flex flex-wrap gap-16">
                {primaryCta ? (
                  <CTAButton href={primaryCta.href} analyticsLabel={primaryCta.label}>
                    {primaryCta.label}
                  </CTAButton>
                ) : null}
                {secondaryCta ? (
                  <CTAButton href={secondaryCta.href} appearance="plain" analyticsLabel={secondaryCta.label}>
                    {secondaryCta.label}
                  </CTAButton>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
        {children}
      </main>
    </>
  )
}
