import type {MetadataRoute} from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://portals.works'
  const paths = [
    '/',
    '/workflow/assessment',
    '/workflow/ai-production-workflow-risks',
    '/paid-pilot',
    '/security-and-architecture',
    '/contact',
    '/privacy-policy',
    '/terms-of-service',
  ]
  return paths.map((path) => ({
    url: new URL(path, siteUrl).toString(),
    changeFrequency: path === '/' ? 'weekly' : 'monthly',
    priority: path === '/' ? 1 : path === '/workflow/assessment' ? 0.9 : 0.7,
  }))
}
