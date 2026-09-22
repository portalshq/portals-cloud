// ponytail: string-scan guardrail, upgrade to eslint rule if it gets noisy.
// Usage: node scripts/check-marketing.mjs
import {readdirSync, readFileSync, statSync} from 'node:fs'
import {join} from 'node:path'

const root = join(import.meta.dirname, '..', 'app', '(marketing)')
const banned = ['bg-[#343434]', 'bg-[#101010]', 'bg-[#d4a15c]', 'bg-white/8 ', 'bg-white/8"', 'use-case-data', 'useCaseCards', '"/workflow/assessment"']

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) yield* walk(path)
    else if (/\.(tsx|ts)$/.test(entry)) yield path
  }
}

let failures = 0
for (const file of walk(root)) {
  const content = readFileSync(file, 'utf8')
  for (const token of banned) {
    if (content.includes(token)) {
      console.error(`BANNED ${token} in ${file}`)
      failures++
    }
  }
}
if (failures > 0) {
  console.error(`\ncheck-marketing: ${failures} violation(s). See app/(marketing)/AGENTS.md.`)
  process.exit(1)
}
console.log('check-marketing: clean')
