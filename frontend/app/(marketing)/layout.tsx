import { MarketingHeader } from '@/components/MarketingHeader'
import { MarketingFooter } from '@/components/marketing/MarketingFooter'

// Metadata is inherited from app/layout.tsx via baseSiteMetadata() —
// single source in src/lib/seo.ts. Do not duplicate it here.

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
