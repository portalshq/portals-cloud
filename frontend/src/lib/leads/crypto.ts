import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

function requiredSecret(name: string): string {
  const value = process.env[name]
  if (value) return value

  if (process.env.NODE_ENV !== 'production' && process.env.LEADS_DRY_RUN === 'true') {
    return `explicit-local-dry-run-${name}`
  }

  throw new Error(`${name} is required.`)
}

function decodedEncryptionKey(configured: string, source: string): Buffer {
  const decoded = Buffer.from(configured, 'base64')
  if (decoded.length !== 32) {
    throw new Error(`${source} must be a base64-encoded 32-byte key.`)
  }
  return decoded
}

function encryptionKey(keyId = process.env.LEADS_ENCRYPTION_KEY_ID || 'v1'): Buffer {
  const currentKeyId = process.env.LEADS_ENCRYPTION_KEY_ID || 'v1'
  const configured = process.env.LEADS_ENCRYPTION_KEY
  if (keyId !== currentKeyId) {
    let keyring: Record<string, string> = {}
    try {
      keyring = process.env.LEADS_ENCRYPTION_KEYRING
        ? JSON.parse(process.env.LEADS_ENCRYPTION_KEYRING)
        : {}
    } catch {
      throw new Error('LEADS_ENCRYPTION_KEYRING must be a JSON object.')
    }
    const historicalKey = keyring[keyId]
    if (!historicalKey) {
      throw new Error(`No lead encryption key is configured for key id ${keyId}.`)
    }
    return decodedEncryptionKey(
      historicalKey,
      `LEADS_ENCRYPTION_KEYRING.${keyId}`,
    )
  }
  if (configured) {
    return decodedEncryptionKey(configured, 'LEADS_ENCRYPTION_KEY')
  }

  return createHmac('sha256', requiredSecret('LEADS_HASH_KEY'))
    .update('local-encryption-key')
    .digest()
}

export function hashValue(value: string): string {
  return createHmac('sha256', requiredSecret('LEADS_HASH_KEY'))
    .update(value)
    .digest('hex')
}

export function encryptJson(value: unknown): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  const keyId = process.env.LEADS_ENCRYPTION_KEY_ID || 'v1'

  return [keyId, iv, tag, ciphertext]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join('.')
}

export function decryptJson<T>(value: string): T {
  const [keyId, iv, tag, ciphertext] = value.split('.')
  if (!keyId || !iv || !tag || !ciphertext) {
    throw new Error('Invalid encrypted payload.')
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(keyId),
    Buffer.from(iv, 'base64url'),
  )
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ])

  return JSON.parse(plaintext.toString('utf8')) as T
}

export function signValue(value: string, secretName: string): string {
  return createHmac('sha256', requiredSecret(secretName))
    .update(value)
    .digest('base64url')
}

export function verifySignature(
  value: string,
  received: string,
  secretName: string,
  encoding: 'base64' | 'base64url' = 'base64url',
): boolean {
  const expected = createHmac('sha256', requiredSecret(secretName))
    .update(value)
    .digest(encoding)
  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(received)
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  )
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}
