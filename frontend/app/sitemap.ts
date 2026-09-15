import {readdir} from 'node:fs/promises'
import path from 'node:path'
import type {MetadataRoute} from 'next'
import {getUseCases} from '@/sanity/lib/use-cases'

const appDirectory = path.join(process.cwd(), 'app')
const excludedRouteRoots = new Set(['account', 'auth', 'workflow', 'resources'])

/**
 * Return public, statically addressable pages from the App Router.
 *
 * Dynamic routes are included separately when their params are owned by the
 * application. CMS-driven routes remain excluded until their SEO fields can
 * be queried alongside their slugs.
 */
async function discoverStaticPages(directory: string, segments: string[] = []): Promise<string[]> {
  if (segments.some((segment) => excludedRouteRoots.has(segment))) return []
  const entries = await readdir(directory, {withFileTypes: true})
  const pages: string[] = []

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue

    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      // Route groups do not contribute to the URL path.
      const nextSegments = entry.name.startsWith('(') && entry.name.endsWith(')')
        ? segments
        : [...segments, entry.name]
      pages.push(...(await discoverStaticPages(entryPath, nextSegments)))
      continue
    }

    if (entry.name !== 'page.tsx' || segments.some((segment) => segment.startsWith('['))) continue
    pages.push(`/${segments.join('/')}`.replace(/\/$/, '') || '/')
  }

  return pages
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://portals.works'
  const useCases = await getUseCases()
  const paths = [
    ...(await discoverStaticPages(appDirectory)),
    ...useCases.map(({slug}) => `/use-cases/${slug}`),
  ]
    .filter((value, index, all) => all.indexOf(value) === index)
    .sort((a, b) => a.localeCompare(b))

  const useCaseByPath = new Map(useCases.map((useCase) => [`/use-cases/${useCase.slug}`, useCase]))
  return paths.map((path) => ({
    url: new URL(path, siteUrl).toString(),
    lastModified: useCaseByPath.get(path)?._updatedAt,
    changeFrequency: path === '/' ? 'weekly' : 'monthly',
    priority: path === '/' ? 1 : path === '/assessment' ? 0.9 : 0.7,
  }))
}
