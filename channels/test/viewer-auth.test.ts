import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const gateway = vi.hoisted(() => ({ startAuthSession: vi.fn() }))
vi.mock('@portalshq/capability-identity', () => ({ createAuthGatewayClient: () => gateway }))

beforeEach(() => {
  vi.stubEnv('AUTH_GATEWAY_TCP_ADDRESS', 'gateway.test:8084')
  vi.stubEnv('CHANNELS_AUTH_ORIGINS', 'http://localhost:4000,http://100.125.2.45:4000')
  gateway.startAuthSession.mockReset()
})

afterEach(() => vi.unstubAllEnvs())

async function start(origin: string) {
  const { POST } = await import('../app/api/auth/[action]/route')
  return POST(new Request(origin + '/api/auth/start', {
    method: 'POST', headers: { origin },
  }), { params: Promise.resolve({ action: 'start' }) })
}

describe('Channels sign-in', () => {
  it('uses the Channels callback on the exact requesting origin', async () => {
    gateway.startAuthSession.mockResolvedValue({ sessionCode: 'session', loginUrl: 'https://auth.test/login' })
    const response = await start('http://100.125.2.45:4000')
    expect(response.status).toBe(200)
    expect(gateway.startAuthSession).toHaveBeenCalledWith(expect.any(String), 'http://100.125.2.45:4000/auth/complete')
    expect((await start('http://127.0.0.1:4000')).status).toBe(403)
    expect(gateway.startAuthSession).toHaveBeenCalledTimes(1)
  })

  it('reports a gateway callback rejection', async () => {
    gateway.startAuthSession.mockRejectedValue({ code: 7 })
    const response = await start('http://localhost:4000')
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: 'This Channels address is not approved by the sign-in gateway.',
    })
  })
})
