import type { Metadata } from 'next'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://portals.works'),
  title: 'The Repository for Creative Production Teams | portals',
  description: 'portals preserves every version and creative decision behind your best assets, so your teams can build on previous work, deliver faster, and scale production.',
  icons: { icon: '/favicon.svg' },
  robots: 'index, follow',
  openGraph: {
    title: 'Version Control for Creative Production Teams | portals',
    description: 'portals preserves every version and creative decision behind your best assets, so your teams can build on previous work, deliver faster, and scale production.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Version Control for Creative Production Teams | portals',
    description: 'portals preserves every version and creative decision behind your best assets, so your teams can build on previous work, deliver faster, and scale production.',
  },
}


function Footer() {
  return (
    <footer className="ui-grid relative z-(--z-footer) h-[90vh] pb-36 text-white lg:pt-36 !lowercase">
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
        <div className="col-span-full h-full space-y-fluid-[32,40] ui-grid grid-cols-1 grid-rows-[min-content_min-content_1fr] lg:grid-rows-[min-content_1fr] lg:grid-cols-5 m-0 p-0">
          <a href="/" className="col-span-full mb-40 t-d1-sans !font-medium">portals</a>
          <div className='col-span-full lg:col-span-3'>
            <p className="lowercase text-white t-p-sans">
              The repository for AI{`\u2011`}native production
            </p>
          </div>

          <div className='col-span-full lg:col-span-2 h-full space-y-fluid-[32,40]'>
          {/* <h4 className="font-medium mb-4">Product</h4> */}
            <ul className="space-y-8 lg:space-y-4 t-p-sans text-white/80">
              <li><a href="/privacy-policy" className="hover:text-white transition-colors">Privacy</a></li>
              <li><a href="/terms-of-service" className="hover:text-white transition-colors">terms of service</a></li>
              <li><a href="/security-and-architecture" className="hover:text-white transition-colors">security</a></li>
              <li><a href="/ai-production-workflow-risks" className="hover:text-white transition-colors">use cases</a></li>
              <li><a href="/assessment" className="hover:text-white transition-colors">assess production workflow</a></li>
            </ul>
            
            <ul className="space-y-8 lg:space-y-4 t-p-sans text-white/80">
              <li><a href="/contact" className="hover:text-white transition-colors">contact us</a></li>
            </ul>
          </div>
          
        </div>
        <div className="relative z-10 flex flex-col lg:items-center pt-12 t-p-sm-sans text-white col-span-full row-start-last">
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
        {children}
      </div>
      <Footer />
    </div>
  )
}
