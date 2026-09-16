import type { Metadata } from 'next'
import { MarketingHeader } from '@/components/MarketingHeader'
import { canonical, SITE_DESCRIPTION } from '@/lib/seo'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://portals.works'),
  title: 'Production memory for AI-native creative teams | portals',
  description: SITE_DESCRIPTION,
  icons: { icon: '/favicon.svg' },
  robots: 'index, follow',
  alternates: { canonical: canonical('/') },
  openGraph: {
    title: 'Production memory for AI-native creative teams | portals',
    description: SITE_DESCRIPTION,
    type: 'website',
    siteName: 'portals',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Production memory for AI-native creative teams | portals',
    description: SITE_DESCRIPTION,
  },
}


function Footer() {
  return (
    <footer className="ui-grid relative z-(--z-footer) min-h-[52vh] pb-50 text-white lg:pt-50">
      <div
        className="pointer-events-none absolute inset-x-0 -top-128 bottom-0 z-0"
        aria-hidden="true"
        style={{
          WebkitBackdropFilter: 'blur(18px)',
          backdropFilter: 'blur(18px)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0px, rgb(0 0 0 / 0.18) 48px, rgb(0 0 0 / 0.72) 104px, black 176px)',
          maskImage: 'linear-gradient(to bottom, transparent 0px, rgb(0 0 0 / 0.18) 48px, rgb(0 0 0 / 0.72) 104px, black 176px)',
          background: 'linear-gradient(to bottom, transparent 0px, rgb(255 255 255 / 0.015) 48px, rgb(255 255 255 / 0.055) 112px, rgb(255 255 255 / 0.1) 176px)',
        }}
      />
      <div className="col-span-full relative z-10 flex flex-col gap-y-fluid-[32,40] mb-12">
        <div className="col-span-full h-full space-y-fluid-[32,40] ui-grid grid-cols-1 lg:grid-cols-5 m-0 p-0">
          <div className="col-span-full mb-24 lg:col-span-2 lg:mb-0">
            <a href="/" className="t-d1-sans !font-medium">portals</a>
            <p className="mt-24 max-w-md t-p-sans">
              Production memory for AI-native creative teams.
            </p>
          </div>

          <div className='col-span-full grid gap-y-32 sm:grid-cols-3 lg:col-span-3'>
            <nav aria-label="Explore" className="space-y-12">
              <h2 className="t-p-sm-sans text-white/50">explore</h2>
              <ul className="space-y-8 t-p-sans text-white/80">
                <li><a href="/production-memory" className="hover:text-white transition-colors">production memory</a></li>
                <li><a href="/use-cases" className="hover:text-white transition-colors">use cases</a></li>
                <li><a href="/assessment" className="hover:text-white transition-colors">assess your workflow</a></li>
                <li><a href="/resources/production-memory-brief" className="hover:text-white transition-colors">production memory brief</a></li>
              </ul>
            </nav>

            <nav aria-label="Work with Portals" className="space-y-12">
              <h2 className="t-p-sm-sans text-white/50">work with portals</h2>
              <ul className="space-y-8 t-p-sans text-white/80">
                <li><a href="/paid-pilot" className="hover:text-white transition-colors">paid pilot</a></li>
                <li><a href="/security-and-architecture" className="hover:text-white transition-colors">security</a></li>
                <li><a href="/contact" className="hover:text-white transition-colors">contact us</a></li>
              </ul>
            </nav>

            <nav aria-label="Legal" className="space-y-12">
              <h2 className="t-p-sm-sans text-white/50">legal</h2>
              <ul className="space-y-8 t-p-sans text-white/80">
                <li><a href="/privacy-policy" className="hover:text-white transition-colors">privacy</a></li>
                <li><a href="/terms-of-service" className="hover:text-white transition-colors">terms of service</a></li>
              </ul>
            </nav>
          </div>

        </div>
        <div className="relative z-10 flex flex-col items-center pt-12 t-p-sm-sans text-white col-span-full row-start-last lg:col-span-3 lg:col-start-3 lg:items-start">
          <span>© 2026 portals.works</span>
        </div>
      </div>
    </footer>
  )
}

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-[100dvh] flex flex-col text-foreground font-sans">
      <div className="flex-1 z-(--z-main) flex flex-col">
        <MarketingHeader />
        {children}
      </div>
      <Footer />
    </div>
  )
}
