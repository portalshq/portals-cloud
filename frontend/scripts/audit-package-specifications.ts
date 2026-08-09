import fs from 'fs'
import path from 'path'
import {fileURLToPath} from 'url'

const __filename = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(__filename), '../..')

const roots = ['frontend', 'sanity']
const allowedFiles = new Set([
  path.join('sanity', 'scripts', 'publish-package-specifications.mjs'),
  path.join('frontend', 'scripts', 'audit-package-specifications.ts'),
])

const ignoredSegments = new Set([
  '.next',
  '.vercel',
  'node_modules',
  'out',
  'dist',
  'build',
  'public',
])

const ignoredExtensions = new Set([
  '.lock',
  '.tsbuildinfo',
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.woff2',
  '.ttf',
])

const forbiddenPatterns = [
  /\$5,000\b/,
  /\$750\b/,
  /\$2,500\b/,
  /\b21 days\b/i,
  /\b48 hours\b/i,
  /\b14 days\b/i,
  /\b10 users\b/i,
  /\bup to 10\b/i,
  /\bup to 5\b/i,
  /\b5 production members\b/i,
  /\b3 active production repositories\b/i,
  /\b20 production members\b/i,
  /\b15 active production repositories\b/i,
]

function shouldSkip(filePath: string): boolean {
  const relative = path.relative(repoRoot, filePath)
  if (allowedFiles.has(relative)) return true

  const parts = relative.split(path.sep)
  if (parts.some((part) => ignoredSegments.has(part))) return true

  return ignoredExtensions.has(path.extname(filePath))
}

function walk(directory: string): string[] {
  const entries = fs.readdirSync(directory, {withFileTypes: true})
  const files: string[] = []

  for (const entry of entries) {
    const filePath = path.join(directory, entry.name)
    if (shouldSkip(filePath)) continue

    if (entry.isDirectory()) {
      files.push(...walk(filePath))
    } else if (entry.isFile()) {
      files.push(filePath)
    }
  }

  return files
}

const violations: string[] = []

for (const root of roots) {
  for (const filePath of walk(path.join(repoRoot, root))) {
    const text = fs.readFileSync(filePath, 'utf8')
    const lines = text.split('\n')

    for (const [index, line] of lines.entries()) {
      for (const pattern of forbiddenPatterns) {
        if (pattern.test(line)) {
          violations.push(
            `${path.relative(repoRoot, filePath)}:${index + 1}: ${line.trim()}`,
          )
          break
        }
      }
    }
  }
}

if (violations.length) {
  console.error(
    [
      'Package specification values must come from standalone Sanity packageSpecification documents.',
      'Move the value into sanity/scripts/publish-package-specifications.mjs and reference it instead.',
      '',
      ...violations,
    ].join('\n'),
  )
  process.exit(1)
}

console.log('Package specification audit passed.')
