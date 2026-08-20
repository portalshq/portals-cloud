import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { resolvePdfFileName } from '@/lib/resource-pdf'
import { getPublishedResourceForPdf, getResourceSlugs } from '@/sanity/lib/resources'
import { getGenerationFingerprint, FIELD_GUIDE_COVER_IMAGE } from './fingerprint'
import { getManifestHash } from './manifest'
import type { Manifest } from './manifest'

const PDF_RESOURCE_PRESETS: Record<
  string,
  { pdf: Record<string, unknown>; coverBackgroundImagePath?: string }
> = {
  'production-memory-field-guide': {
    pdf: { coverStyle: 'fullPageArtwork', includeDocumentCoverImage: false },
    coverBackgroundImagePath: FIELD_GUIDE_COVER_IMAGE,
  },
}

export type GenerateResult = {
  slug: string
  fileName: string
  buffer?: Buffer
  hash: string
  skipped: boolean
  reason?: string
}

export async function generateForSlugs(
  slugs: string[],
  opts: { manifest: Manifest; generationFingerprint: string },
): Promise<GenerateResult[]> {
  const results: GenerateResult[] = []
  for (const slug of slugs) {
    const doc = await getPublishedResourceForPdf(slug)
    if (!doc) {
      results.push({ slug, fileName: `${slug}.pdf`, hash: '', skipped: true, reason: 'not-found' })
      continue
    }
    if (doc.pdf?.enabled === false) {
      results.push({ slug, fileName: resolvePdfFileName(doc), hash: '', skipped: true, reason: 'disabled' })
      continue
    }
    const fileName = resolvePdfFileName(doc)
    const preset = PDF_RESOURCE_PRESETS[slug]
    const pdfDocument = preset
      ? { ...doc, pdf: { ...doc.pdf, ...(preset.pdf as object) } }
      : doc

    const contentHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ document: doc, generationFingerprint: opts.generationFingerprint, fileName }))
      .digest('hex')

    if (getManifestHash(opts.manifest[slug]) === contentHash) {
      results.push({ slug, fileName, hash: contentHash, skipped: true, reason: 'unchanged' })
      continue
    }

    // Dynamic import to avoid Turbopack tracing font files at build time for the webhook route
    const { pdf } = await import('@react-pdf/renderer')
    const { PaidPilotPdfDocument } = await import('@/components/pdf/PaidPilotPdfDocument')
    const { ResourcePdfDocument } = await import('@/components/pdf/ResourcePdfDocument')
    const docElement =
      slug === 'paid-pilot'
        ? React.createElement(PaidPilotPdfDocument, { document: pdfDocument as never })
        : React.createElement(ResourcePdfDocument, {
            document: pdfDocument as never,
            assets: { coverBackgroundImage: preset?.coverBackgroundImagePath },
          })

    const blob = await pdf(docElement as never).toBlob()
    const buffer = Buffer.from(await blob.arrayBuffer())
    results.push({ slug, fileName, buffer, hash: contentHash, skipped: false })
  }
  return results
}

export async function generateForSanitySlugs(slugs: string[]): Promise<{
  results: GenerateResult[]
  generationFingerprint: string
  manifestPath: string
  pdfsDir: string
}> {
  const assetsDir = path.resolve(process.cwd(), '../generated-assets')
  const altAssetsDir = path.resolve(process.cwd(), 'generated-assets')
  const resolvedAssetsDir = fs.existsSync(assetsDir) ? assetsDir : altAssetsDir
  const pdfsDir = path.join(resolvedAssetsDir, 'pdfs')
  const manifestPath = path.join(resolvedAssetsDir, 'manifest.json')
  const generationFingerprint = getGenerationFingerprint()

  // Ensure dirs exist (for local dev)
  if (!fs.existsSync(pdfsDir)) fs.mkdirSync(pdfsDir, { recursive: true })

  const { readManifest } = await import('./manifest')
  const manifest = readManifest(manifestPath)

  // If slugs empty, fallback to all published
  const targetSlugs = slugs.length ? slugs : (await getResourceSlugs()).map((s) => s.slug)

  const results = await generateForSlugs(targetSlugs, { manifest, generationFingerprint })
  return { results, generationFingerprint, manifestPath, pdfsDir }
}
