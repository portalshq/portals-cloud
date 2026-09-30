import type { MetadataRoute } from 'next'
import { canonical, siteUrl } from '@/lib/seo'
import { getBlogPosts } from '@/sanity/lib/blog'
import { getUseCases } from '@/sanity/lib/use-cases'

// Allowlist IA. Adding a marketing route requires adding it here + metadata + OG image.
// Use-case URLs come solely from published Sanity `useCaseDocument` documents.
const STATIC_PATHS = [
  '/',
  '/px',
  '/assessment',
  '/production-memory',
  '/use-cases',
  '/blog',
  '/pilot',
  '/security-and-architecture',
  '/contact',
  '/privacy-policy',
  '/terms-of-service',
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [useCases, posts] = await Promise.all([getUseCases(), getBlogPosts()])
  const useCaseEntries: MetadataRoute.Sitemap = useCases.map((useCase) => ({
    url: canonical(`/use-cases/${useCase.slug}`),
    lastModified: useCase._updatedAt,
  }))
  const blogEntries: MetadataRoute.Sitemap = posts.map((post) => ({
    url: canonical(`/blog/${post.slug}`),
    lastModified: post.updatedAt || post.publishedAt,
  }))

  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    // /px is a GitHub Pages rewrite that intentionally keeps its non-slash URL.
    url: path === '/px' ? new URL(path, siteUrl()).toString() : canonical(path),
  }))

  return [...staticEntries, ...useCaseEntries, ...blogEntries].sort((a, b) => a.url.localeCompare(b.url))
}
