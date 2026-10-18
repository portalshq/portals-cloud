#!/usr/bin/env node
// Report JSON structure only. Never print JWK values, PEM material, or a file excerpt.
import {readFileSync} from 'node:fs'

if (process.argv.length !== 3) {
  throw new Error('usage: node inspect-auth-key-shape.mjs /private/path/jwt-signing.jwk')
}

const raw = readFileSync(process.argv[2], 'utf8')
let parsed
try {
  parsed = JSON.parse(raw)
} catch {
  console.log(JSON.stringify({format: raw.startsWith('-----BEGIN ') ? 'PEM' : 'non-JSON'}, null, 2))
  process.exit(0)
}

function describe(value, depth = 0) {
  if (value === null) return {type: 'null'}
  if (Array.isArray(value)) {
    return {
      type: 'array',
      count: value.length,
      first: depth < 3 && value.length ? describe(value[0], depth + 1) : undefined,
    }
  }
  if (typeof value !== 'object') return {type: typeof value}
  const keys = Object.keys(value)
  const safeNames = keys.slice(0, 25).map((key) =>
    /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(key) ? key : '<opaque-field-name>')
  const nested = {}
  if (depth < 3) {
    for (const key of keys.slice(0, 25)) {
      if (value[key] !== null && typeof value[key] === 'object') {
        nested[safeNames[keys.indexOf(key)]] = describe(value[key], depth + 1)
      }
    }
  }
  return {
    type: 'object',
    fields: safeNames,
    totalFields: keys.length,
    nested: Object.keys(nested).length ? nested : undefined,
  }
}

console.log(JSON.stringify(describe(parsed), null, 2))
