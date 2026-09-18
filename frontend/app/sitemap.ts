import type {MetadataRoute} from 'next'
import {getBlogPosts} from '@/sanity/lib/blog'
import {getUseCases} from '@/sanity/lib/use-cases'

// Allowlist IA. Adding a marketing route requires adding it here + metadata + OG image.
// Use-case URLs come solely from published Sanity `useCaseDocument` documents.
const STATIC_PATHS: Array<{path: string; changeFrequency: 'weekly' | 'monthly' | 'yearly'; priority: number}> = [
  {path: '/', changeFrequency: 'weekly', priority: 1},
  {path: '/px', changeFrequency: 'weekly', priority: 0.9},
  {path: '/assessment', changeFrequency: 'weekly', priority: 0.9},
  {path: '/production-memory', changeFrequency: 'weekly', priority: 0.9},
  {path: '/use-cases', changeFrequency: 'weekly', priority: 0.9},
  {path: '/blog', changeFrequency: 'weekly', priority: 0.8},
  {path: '/resources/production-memory-brief', changeFrequency: 'monthly', priority: 0.7},
  {path: '/paid-pilot', changeFrequency: 'monthly', priority: 0.7},
  {path: '/security-and-architecture', changeFrequency: 'monthly', priority: 0.7},
  {path: '/contact', changeFrequency: 'monthly', priority: 0.7},
  {path: '/workflow/ai-production-workflow-risks', changeFrequency: 'monthly', priority: 0.6},
  {path: '/privacy-policy', changeFrequency: 'yearly', priority: 0.3},
  {path: '/terms-of-service', changeFrequency: 'yearly', priority: 0.3},
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://portals.works'
  const [useCases, posts] = await Promise.all([getUseCases(), getBlogPosts()])
  const useCaseEntries: MetadataRoute.Sitemap = useCases.map((useCase) => ({
    url: new URL(`/use-cases/${useCase.slug}`, siteUrl).toString(),
    lastModified: useCase._updatedAt,
    changeFrequency: 'monthly',
    priority: 0.8,
  }))
  const blogEntries: MetadataRoute.Sitemap = posts.map((post) => ({
    url: new URL(`/blog/${post.slug}`, siteUrl).toString(),
    lastModified: post._updatedAt,
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map(({path, changeFrequency, priority}) => ({
    url: new URL(path, siteUrl).toString(),
    changeFrequency,
    priority,
  }))

  return [...staticEntries, ...useCaseEntries, ...blogEntries].sort((a, b) => a.url.localeCompare(b.url))
}
