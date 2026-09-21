import type { Metadata } from 'next'
import { MarketingHeader } from '@/components/MarketingHeader'
import { MarketingFooter } from '@/components/marketing/MarketingFooter'
import { canonical, SITE_DESCRIPTION } from '@/lib/seo'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://portals.works'),
  title: 'Production memory for AI-native creative teams | portals',
  description: SITE_DESCRIPTION,
  icons: { icon: '/favicon-blue.svg' },
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
      <MarketingFooter />
    </div>
  )
}
