/**
 * Robust IP extraction utility for analytics and geolocation.
 * Handles various proxy/load balancer headers used in production environments.
 */

const PRIVATE_IP_PATTERNS = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^::1$/,
  /^localhost$/,
  /^0\./,
  /^fc00:/i,
  /^fe80:/i,
]

function isPrivateIp(ip: string): boolean {
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(ip))
}

function extractFromForwardedFor(header: string): string | null {
  // X-Forwarded-For can contain multiple IPs: "client, proxy1, proxy2"
  // The first IP is typically the client
  const ips = header.split(',').map((ip) => ip.trim())
  for (const ip of ips) {
    if (ip && !isPrivateIp(ip)) {
      return ip
    }
  }
  return null
}

function extractFromForwarded(header: string): string | null {
  // Forwarded header format: "for=192.0.2.60;proto=http;by=203.0.113.43"
  const forMatch = header.match(/for=([^;]+)/i)
  if (forMatch) {
    const ip = forMatch[1].trim()
    // Remove port if present
    const ipWithoutPort = ip.split(':')[0]
    if (!isPrivateIp(ipWithoutPort)) {
      return ipWithoutPort
    }
  }
  return null
}

export function extractClientIp(request: Request): string | null {
  try {
    // Try various headers in order of preference
    const headers = request.headers

    // Cloudflare
    const cfConnectingIp = headers.get('CF-Connecting-IP')
    if (cfConnectingIp && !isPrivateIp(cfConnectingIp)) {
      return cfConnectingIp
    }

    // AWS ALB
    const xForwardedFor = headers.get('X-Forwarded-For')
    if (xForwardedFor) {
      const extracted = extractFromForwardedFor(xForwardedFor)
      if (extracted) return extracted
    }

    // Standard Forwarded header
    const forwarded = headers.get('Forwarded')
    if (forwarded) {
      const extracted = extractFromForwarded(forwarded)
      if (extracted) return extracted
    }

    // X-Real-IP (Nginx)
    const xRealIp = headers.get('X-Real-IP')
    if (xRealIp && !isPrivateIp(xRealIp)) {
      return xRealIp
    }

    // X-Client-IP (some CDNs)
    const xClientIp = headers.get('X-Client-IP')
    if (xClientIp && !isPrivateIp(xClientIp)) {
      return xClientIp
    }

    // True-Client-IP (Akamai)
    const trueClientIp = headers.get('True-Client-IP')
    if (trueClientIp && !isPrivateIp(trueClientIp)) {
      return trueClientIp
    }

    // Fall back to remote address (not available in standard Request object)
    // In Next.js edge/runtime, this would need to be handled differently
    return null
  } catch (error) {
    console.error('Error extracting client IP:', error)
    return null
  }
}

export function isValidIp(ip: string): boolean {
  // Basic IPv4 validation
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
  // Basic IPv6 validation (simplified)
  const ipv6Regex = /^[0-9a-fA-F:]+$/

  return ipv4Regex.test(ip) || ipv6Regex.test(ip)
}

export function sanitizeIp(ip: string | null): string | null {
  if (!ip) return null
  const trimmed = ip.trim()
  if (!isValidIp(trimmed)) return null
  if (isPrivateIp(trimmed)) return null
  return trimmed
}
