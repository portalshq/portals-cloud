import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import {fileURLToPath} from 'url'
import {pdf} from '@react-pdf/renderer'
import React from 'react'
import {PaidPilotPdfDocument} from '../src/components/pdf/PaidPilotPdfDocument.js'
import {ResourcePdfDocument} from '../src/components/pdf/ResourcePdfDocument.js'
import {resolvePdfFileName} from '../src/lib/resource-pdf.js'
import {
  getPublishedResourceForPdf,
  getResourceSlugs,
} from '../src/sanity/lib/resources.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

type ManifestEntry =
  | string
  | {
      hash: string
      fileName: string
    }

type Manifest = Record<string, ManifestEntry>

const FIELD_GUIDE_COVER_IMAGE = path.resolve(
  __dirname,
  '../public/images/pdf/production-memory-cover.png',
)

const GENERATION_FINGERPRINT_FILES = [
  __filename,
  path.resolve(__dirname, '../src/components/pdf/PaidPilotPdfDocument.tsx'),
  path.resolve(__dirname, '../src/components/pdf/ResourcePdfDocument.tsx'),
  path.resolve(__dirname, '../src/pdf-templates/ResourceTemplate.tsx'),
  path.resolve(__dirname, '../src/lib/package-specifications.ts'),
  path.resolve(__dirname, '../src/lib/resource-pdf.ts'),
  FIELD_GUIDE_COVER_IMAGE,
  path.resolve(__dirname, '../public/fonts/pdf/DieGroteskC-Light.ttf'),
  path.resolve(__dirname, '../public/fonts/pdf/DieGroteskC-Regular.ttf'),
  path.resolve(__dirname, '../public/fonts/pdf/DieGroteskB-Regular.ttf'),
  path.resolve(__dirname, '../public/fonts/pdf/DieGroteskB-Medium.ttf'),
]

const PDF_RESOURCE_PRESETS: Record<
  string,
  {
    pdf: Partial<NonNullable<Awaited<ReturnType<typeof getPublishedResourceForPdf>>['pdf']>>
    coverBackgroundImagePath?: string
  }
> = {
  'production-memory-field-guide': {
    pdf: {
      coverStyle: 'fullPageArtwork',
      includeDocumentCoverImage: false,
    },
    coverBackgroundImagePath: FIELD_GUIDE_COVER_IMAGE,
  },
}

function hashFiles(filePaths: string[]): string {
  const hash = crypto.createHash('sha256')

  for (const filePath of filePaths) {
    hash.update(filePath)
    hash.update(fs.readFileSync(filePath))
  }

  return hash.digest('hex')
}

function readManifest(manifestPath: string): Manifest {
  if (!fs.existsSync(manifestPath)) {
    return {}
  }

  return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
}

function getManifestHash(entry: ManifestEntry | undefined): string | undefined {
  return typeof entry === 'string' ? entry : entry?.hash
}

async function main() {
  const slugs = await getResourceSlugs()
  const assetsDir = path.resolve(__dirname, '../../generated-assets')
  const pdfsDir = path.join(assetsDir, 'pdfs')
  const manifestPath = path.join(assetsDir, 'manifest.json')
  const generationFingerprint = hashFiles(GENERATION_FINGERPRINT_FILES)

  if (!fs.existsSync(pdfsDir)) {
    fs.mkdirSync(pdfsDir, {recursive: true})
  }

  const manifest = readManifest(manifestPath)

  for (const {slug} of slugs) {
    console.log(`Checking ${slug}...`)
    const doc = await getPublishedResourceForPdf(slug)
    if (!doc) continue

    if (doc.pdf?.enabled === false) {
      console.log(`Skipping ${slug}, PDF generation is disabled.`)
      continue
    }

    const fileName = resolvePdfFileName(doc)
    const preset = PDF_RESOURCE_PRESETS[slug]
    const pdfDocument = preset
      ? {
          ...doc,
          pdf: {
            ...doc.pdf,
            ...preset.pdf,
          },
        }
      : doc
    const contentHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({document: doc, generationFingerprint, fileName}))
      .digest('hex')

    if (getManifestHash(manifest[slug]) === contentHash) {
      console.log(`Skipping ${slug}, no changes.`)
      continue
    }

    console.log(`Generating ${fileName}...`)
    const docElement =
      slug === 'paid-pilot'
        ? React.createElement(PaidPilotPdfDocument, {
            document: pdfDocument,
          })
        : React.createElement(ResourcePdfDocument, {
            document: pdfDocument,
            assets: {
              coverBackgroundImage: preset?.coverBackgroundImagePath,
            },
          })
    const blob = await pdf(docElement).toBlob()
    const buffer = Buffer.from(await blob.arrayBuffer())

    fs.writeFileSync(path.join(pdfsDir, fileName), buffer)

    manifest[slug] = {hash: contentHash, fileName}
  }

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log('PDF generation complete.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
