import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const FIELD_GUIDE_COVER_IMAGE = path.resolve(
  process.cwd(),
  'public/images/pdf/production-memory-cover.png',
)

export const GENERATION_FINGERPRINT_FILES = [
  'src/components/pdf/PaidPilotPdfDocument.tsx',
  'src/components/pdf/ResourcePdfDocument.tsx',
  'src/lib/package-specifications.ts',
  'src/lib/resource-pdf.ts',
  'public/images/pdf/production-memory-cover.png',
  'public/fonts/pdf/DieGroteskC-Light.ttf',
  'public/fonts/pdf/DieGroteskC-Regular.ttf',
  'public/fonts/pdf/DieGroteskB-Regular.ttf',
  'public/fonts/pdf/DieGroteskB-Medium.ttf',
]

export function hashFiles(relativePaths: string[]): string {
  const hash = crypto.createHash('sha256')
  for (const rel of relativePaths) {
    const abs = path.resolve(process.cwd(), rel)
    hash.update(rel)
    if (fs.existsSync(abs)) {
      hash.update(fs.readFileSync(abs))
    }
  }
  return hash.digest('hex')
}

export function getGenerationFingerprint(): string {
  return hashFiles(GENERATION_FINGERPRINT_FILES)
}
