/**
 * Cross-environment UUID generation utility.
 *
 * Uses crypto.randomUUID() when available (Node.js 15.0+, modern browsers),
 * with a fallback implementation for older environments.
 */

/**
 * Generate a RFC 4122 v4 UUID.
 * @returns A UUID string in the format xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 */
export function generateUUID(): string {
  // Use native crypto.randomUUID() if available (Node.js 15.0+, modern browsers)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // Fallback implementation for environments without native UUID support
  return generateFallbackUUID();
}

/**
 * Fallback UUID v4 implementation using Math.random().
 * This is less cryptographically secure than the native implementation but
 * provides sufficient uniqueness for most use cases.
 */
function generateFallbackUUID(): string {
  // Generate 16 random bytes (32 hex digits)
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }

  // Set version bits (v4) and variant bits (RFC 4122)
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1

  // Convert to UUID string format
  const hexDigits: string[] = [];
  for (let i = 0; i < 16; i++) {
    hexDigits.push(bytes[i].toString(16).padStart(2, '0'));
  }

  return [
    hexDigits.slice(0, 4).join(''),
    hexDigits.slice(4, 6).join(''),
    hexDigits.slice(6, 8).join(''),
    hexDigits.slice(8, 10).join(''),
    hexDigits.slice(10, 16).join('')
  ].join('-');
}
