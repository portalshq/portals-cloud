import { MarketingHeader } from '@/components/MarketingHeader'
import { MarketingFooter } from '@/components/marketing/MarketingFooter'
import { getBlogPosts } from '@/sanity/lib/blog'
import { getUseCases } from '@/sanity/lib/use-cases'

// Metadata is inherited from app/layout.tsx via baseSiteMetadata() —
// single source in src/lib/seo.ts. Do not duplicate it here.

// Breadcrumbs read lowercase; "AI" stays upright. Done in data, not CSS —
// DESIGN.md bans forced `!lowercase`.
const crumb = (title: string) => title.toLowerCase().replace(/\bai\b/g, 'AI')

// Slug -> document title, so `/use-cases/<slug>` and `/blog/<slug>` can extend
// their parent's breadcrumb. Deduped per request by `cache()` in the lib.
async function getDetailLabels() {
  const [useCases, posts] = await Promise.all([getUseCases(), getBlogPosts()]).catch(() => [[], []])
  const labels: Record<string, string> = {}
  for (const doc of useCases) labels[doc.slug] = crumb(doc.title)
  // Blog titles are full H1s; seo.metaTitle is the condensed one editors already wrote.
  for (const post of posts) labels[post.slug] = crumb(post.metaTitle || post.title)
  return labels
}

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const detailLabels = await getDetailLabels()

  return (
    <div className="min-h-[100dvh] flex flex-col text-foreground font-sans">
      <div className="flex-1 z-(--z-main) flex flex-col">
        <MarketingHeader detailLabels={detailLabels} />
        {children}
      </div>
      <MarketingFooter />
    </div>
  )
}
