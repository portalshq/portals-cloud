import {createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual} from 'node:crypto'
import {config} from './config.js'

const encryptionKey = Buffer.from(config.encryptionKey, 'base64')
if (encryptionKey.length !== 32) throw new Error('LEADS_ENCRYPTION_KEY must be a base64-encoded 32-byte key.')

export function hashValue(value: string): string {
  return createHmac('sha256', config.hashKey).update(value).digest('hex')
}

export function encryptJson(value: unknown): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return [config.encryptionKeyId, iv, cipher.getAuthTag(), ciphertext]
    .map((part) => typeof part === 'string' ? part : part.toString('base64url'))
    .join('.')
}

export function decryptJson<T>(value: string): T {
  const [keyId, iv, tag, ciphertext] = value.split('.')
  if (keyId !== config.encryptionKeyId || !iv || !tag || !ciphertext) throw new Error('Invalid encrypted payload.')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8')) as T
}

export function randomToken(): string {
  return randomBytes(32).toString('base64url')
}

export function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}
