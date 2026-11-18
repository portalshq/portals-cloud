import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const gateway = vi.hoisted(() => ({ startAuthSession: vi.fn(), getAuthSession: vi.fn(), verifyUser: vi.fn(), setUserDisplayName: vi.fn() }))
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
  it('starts a popup without redirecting the card and polls without redeeming an unfinished session', async () => {
    const { POST } = await import('../app/api/auth/[action]/route')
    const id = '00000000-0000-0000-0000-000000000001'
    gateway.startAuthSession.mockResolvedValueOnce({ sessionCode: id, loginUrl: 'https://auth.test/login' })
    const popup = await POST(new Request('http://localhost:4000/api/auth/start-popup', {
      method: 'POST', headers: { origin: 'http://localhost:4000' },
    }), { params: Promise.resolve({ action: 'start-popup' }) })
    expect(popup.status).toBe(200)
    const { state } = await popup.json()
    expect(gateway.startAuthSession).toHaveBeenCalledWith(state)
    gateway.getAuthSession.mockResolvedValueOnce(null)
    const poll = await POST(new Request('http://localhost:4000/api/auth/poll', {
      method: 'POST', body: JSON.stringify({ state, sessionCode: id }),
    }), { params: Promise.resolve({ action: 'poll' }) })
    expect(poll.status).toBe(202)
    expect(await poll.json()).toEqual({ pending: true })
  })

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

describe('Channels username', () => {
  it('recovers a saved username when the login session has an empty name snapshot', async () => {
    gateway.getAuthSession.mockResolvedValueOnce({ userToken: 'token', userId: 'viewer', userName: '' })
    gateway.verifyUser.mockResolvedValueOnce({ userId: 'viewer', displayName: 'Ranger' })
    const { POST } = await import('../app/api/auth/[action]/route')
    const id = '00000000-0000-0000-0000-000000000001'
    const response = await POST(new Request('http://localhost:4000/api/auth/complete', {
      method: 'POST', body: JSON.stringify({ state: id, sessionCode: id }),
    }), { params: Promise.resolve({ action: 'complete' }) })
    expect(await response.json()).toMatchObject({ userId: 'viewer', displayName: 'Ranger' })
  })

  it('returns the stored username when the account has already chosen one', async () => {
    gateway.setUserDisplayName.mockRejectedValueOnce({ code: 9 })
    gateway.verifyUser.mockResolvedValueOnce({ userId: 'viewer', displayName: 'Ranger' })
    const { POST } = await import('../app/api/auth/[action]/route')
    const response = await POST(new Request('http://localhost:4000/api/auth/display-name', {
      method: 'POST', headers: { authorization: 'Bearer token' },
      body: JSON.stringify({ displayName: 'Other' }),
    }), { params: Promise.resolve({ action: 'display-name' }) })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ displayName: 'Ranger' })
  })
})
