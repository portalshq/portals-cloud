import { createAuthGatewayClient } from '@portalshq/capability-identity'

let gateway: ReturnType<typeof createAuthGatewayClient> | undefined
/** Returns null for a guest; invalid credentials fail closed. */
export async function notificationViewer(request: Request) {
  const header = request.headers.get('authorization')
  if (!header) return null
  const token = header.match(/^Bearer (\S+)$/i)?.[1]
  if (!token) throw Object.assign(new Error('Invalid credential'), { code: 16 })
  const address = process.env.AUTH_GATEWAY_TCP_ADDRESS?.trim()
  if (!address) throw new Error('Authentication unavailable')
  gateway ??= createAuthGatewayClient({ address, useTls: process.env.AUTH_GATEWAY_TLS?.trim().toLowerCase() === 'true' })
  return gateway.verifyUser(token)
}
