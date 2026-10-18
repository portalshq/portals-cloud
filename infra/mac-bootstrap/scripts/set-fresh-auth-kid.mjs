#!/usr/bin/env node
// Assign a new public key ID for a fresh RSA Auth identity while preserving
// every other private auth.env setting. Never print environment file contents.
import {
  closeSync, constants, fsyncSync, lstatSync, openSync, readFileSync,
  renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {dirname, join, resolve} from 'node:path'

const args = process.argv.slice(2)
if (args.length !== 5 || args[0] !== '--auth-env' || args[2] !== '--secrets-dir' || args[4] !== '--confirm-fresh-identity') {
  throw new Error('usage: set-fresh-auth-kid.mjs --auth-env PATH --secrets-dir PATH --confirm-fresh-identity')
}
const authEnv = resolve(args[1])
const secretsDir = resolve(args[3])
const serviceUid = process.getuid?.()

function requirePrivate(path, kind) {
  const link = lstatSync(path)
  const file = statSync(path)
  if (link.isSymbolicLink() || (kind === 'file' ? !file.isFile() : !file.isDirectory())) {
    throw new Error(`${path} must be a regular ${kind}, not a symlink`)
  }
  if (serviceUid !== undefined && file.uid !== serviceUid) {
    throw new Error(`${path} must be owned by the current service account`)
  }
  if ((file.mode & 0o077) !== 0) throw new Error(`${path} must deny group and other access`)
}

requirePrivate(authEnv, 'file')
requirePrivate(dirname(authEnv), 'directory')
requirePrivate(secretsDir, 'directory')
const archivedPath = join(secretsDir, 'jwt-signing.jwk')
requirePrivate(archivedPath, 'file')
let archived
try {
  archived = JSON.parse(readFileSync(archivedPath, 'utf8'))
} catch {
  throw new Error('archived jwt-signing.jwk must be valid JSON')
}
if (archived?.kty !== 'EC' || typeof archived.kid !== 'string' || !archived.kid) {
  throw new Error('this one-time helper requires a single archived EC JWK with a kid')
}
const oldEnv = readFileSync(authEnv, 'utf8')
const kidLines = [...oldEnv.matchAll(/^JWT_KID=(.*)$/gm)]
if (kidLines.length !== 1 || kidLines[0][1] !== archived.kid) {
  throw new Error('JWT_KID no longer matches the archived EC key; no change made')
}
try {
  lstatSync(join(secretsDir, 'signing-key'))
  throw new Error('active signing-key already exists; no change made')
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}

const newKid = `auth-${randomUUID()}`
const newEnv = oldEnv.replace(/^JWT_KID=.*$/m, `JWT_KID=${newKid}`)
const temporary = join(dirname(authEnv), `.auth-env-new-kid-${process.pid}-${randomUUID()}`)
let fd
try {
  fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600)
  writeFileSync(fd, newEnv)
  fsyncSync(fd)
  closeSync(fd)
  fd = undefined
  renameSync(temporary, authEnv)
} catch (error) {
  if (fd !== undefined) closeSync(fd)
  rmSync(temporary, {force: true})
  throw error
}
console.log('Assigned a new unique JWT_KID for the fresh RSA Auth identity; all other auth.env settings were preserved.')
console.log(`New public JWT_KID: ${newKid}`)
