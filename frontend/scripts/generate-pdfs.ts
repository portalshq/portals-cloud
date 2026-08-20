import fs from 'node:fs'
import path from 'node:path'
import { getResourceSlugs } from '../src/sanity/lib/resources.js'
import { generateForSlugs } from '../src/lib/pdf/generate.js'
import { writePdfsToDisk } from '../src/lib/pdf/github.js'
import { getGenerationFingerprint } from '../src/lib/pdf/fingerprint.js'
import { readManifest } from '../src/lib/pdf/manifest.js'

async function main() {
  const cliSlugs = process.argv.includes('--slugs')
    ? (process.argv[process.argv.indexOf('--slugs') + 1] || '').split(',').map((s) => s.trim()).filter(Boolean)
    : []

  const slugs = cliSlugs.length ? cliSlugs : (await getResourceSlugs()).map((s) => s.slug)

  const assetsDir = path.resolve(process.cwd(), '../generated-assets')
  const altAssetsDir = path.resolve(process.cwd(), 'generated-assets')
  const resolvedAssetsDir = fs.existsSync(assetsDir) ? assetsDir : altAssetsDir
  const pdfsDir = path.join(resolvedAssetsDir, 'pdfs')
  const manifestPath = path.join(resolvedAssetsDir, 'manifest.json')
  const generationFingerprint = getGenerationFingerprint()

  if (!fs.existsSync(pdfsDir)) fs.mkdirSync(pdfsDir, { recursive: true })

  const manifest = readManifest(manifestPath) as Record<string, { hash: string; fileName: string }>

  console.log(`Generation fingerprint: ${generationFingerprint.slice(0, 8)}...`)
  console.log(`Checking ${slugs.length} slug(s): ${slugs.join(', ') || '(none)'}`)

  const results = await generateForSlugs(slugs, { manifest, generationFingerprint })

  for (const r of results) {
    if (r.skipped) console.log(`Skipping ${r.slug}: ${r.reason}`)
    else console.log(`Generating ${r.fileName}...`)
  }

  writePdfsToDisk(pdfsDir, manifestPath, results, manifest)

  // Cleanup stale entries: slugs that no longer exist as published docs
  // Already handled for disabled/not-found via writePdfsToDisk; also prune manifest entries not in current slugs
  console.log('PDF generation complete.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
