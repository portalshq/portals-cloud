import type {MetadataRoute} from 'next'
import {getBlogPosts} from '@/sanity/lib/blog'
import {getUseCases} from '@/sanity/lib/use-cases'

// Allowlist IA. Adding a marketing route requires adding it here + metadata + OG image.
// Use-case URLs come solely from published Sanity `useCaseDocument` documents.
const STATIC_PATHS = [
  '/',
  '/px',
  '/assessment',
  '/production-memory',
  '/use-cases',
  '/blog',
  '/resources/production-memory-brief',
  '/pilot',
  '/security-and-architecture',
  '/contact',
  '/workflow/ai-production-workflow-risks',
  '/privacy-policy',
  '/terms-of-service',
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://portals.works'
  const [useCases, posts] = await Promise.all([getUseCases(), getBlogPosts()])
  const useCaseEntries: MetadataRoute.Sitemap = useCases.map((useCase) => ({
    url: new URL(`/use-cases/${useCase.slug}`, siteUrl).toString(),
    lastModified: useCase._updatedAt,
  }))
  const blogEntries: MetadataRoute.Sitemap = posts.map((post) => ({
    url: new URL(`/blog/${post.slug}`, siteUrl).toString(),
    lastModified: post.updatedAt || post.publishedAt,
  }))

  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    url: new URL(path, siteUrl).toString(),
  }))

  return [...staticEntries, ...useCaseEntries, ...blogEntries].sort((a, b) => a.url.localeCompare(b.url))
}
