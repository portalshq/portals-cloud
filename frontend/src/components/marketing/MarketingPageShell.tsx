import type { ReactNode } from 'react'
import { CTAButton } from '@/components/CTAButton'

type Props = {
  eyebrow?: string
  title: ReactNode
  lede?: ReactNode
  sub?: ReactNode
  primaryCta?: { href: string; label: string }
  secondaryCta?: { href: string; label: string }
  children?: ReactNode
}

/**
 * Single shell for marketing subpage heroes.
 * Enforces: one H1, eyebrow + lede hierarchy, 1 primary + 1 quiet secondary CTA.
 * The site header comes from the layout — never render one here.
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
      <main className="text-white">
        <section className="mx-auto max-w-6xl ui-grid min-h-[97vh] items-center py-80">
          <div className="col-span-full ">
            {eyebrow ? <p className="t-p-sans mb-24">{eyebrow}</p> : null}
            <h1 className="t-d2-sans max-w-5xl">{title}</h1>
            {lede ? <p className="t-p-lg-serif mt-32 max-w-3xl text-white/80">{lede}</p> : null}
            {sub ? <p className="t-p-sans mt-24 max-w-2xl text-white/65">{sub}</p> : null}
            {primaryCta || secondaryCta ? (
              <div className="mt-40 flex flex-wrap gap-16">
                {secondaryCta ? (
                  <CTAButton href={secondaryCta.href} appearance="plain" analyticsLabel={secondaryCta.label}>
                    {secondaryCta.label}
                  </CTAButton>
                ) : null}
                {primaryCta ? (
                  <CTAButton href={primaryCta.href} analyticsLabel={primaryCta.label}>
                    {primaryCta.label}
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
