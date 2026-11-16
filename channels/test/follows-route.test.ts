import { beforeEach, describe, expect, it, vi } from 'vitest'

const { verifyUser, sync, list, follow, unfollow, query } = vi.hoisted(() => ({
  verifyUser: vi.fn(), sync: vi.fn(), list: vi.fn(), follow: vi.fn(), unfollow: vi.fn(), query: vi.fn(),
}))
vi.mock('@portalshq/capability-identity', () => ({
  createAuthGatewayClient: () => ({ verifyUser }),
  CentralIdentityStore: class { syncFromAuthGateway = sync },
  ProgramFollowsStore: class { list = list; follow = follow; unfollow = unfollow },
}))
vi.mock('../lib/admin/db', () => ({ centralDb: () => ({ query }) }))
import { GET, POST } from '../app/api/follows/route'

describe('follows API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.AUTH_GATEWAY_TCP_ADDRESS = 'localhost:1234'
    verifyUser.mockResolvedValue({ userId: 'verified-user', displayName: 'Viewer' })
    sync.mockResolvedValue(undefined)
    list.mockResolvedValue(['show'])
    follow.mockResolvedValue(undefined)
    query.mockResolvedValue({ rowCount: 1, rows: [{ id: 'show' }] })
  })

  it('requires a credential and rejects cross-site writes', async () => {
    expect((await GET(new Request('https://example.test/api/follows'))).status).toBe(401)
    expect((await POST(new Request('https://example.test/api/follows', { method: 'POST', headers: { 'sec-fetch-site': 'cross-site' } }))).status).toBe(403)
    expect(verifyUser).not.toHaveBeenCalled()
  })

  it('uses the verified user, never a supplied user id', async () => {
    const response = await POST(new Request('https://example.test/api/follows', {
      method: 'POST', headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
      body: JSON.stringify({ programId: 'show', follow: true, userId: 'attacker-choice' }),
    }))
    expect(response.status).toBe(200)
    expect(follow).toHaveBeenCalledWith('verified-user', 'show')
  })

  it('does not let a suspended user read or mutate follows', async () => {
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] })
    const response = await GET(new Request('https://example.test/api/follows', { headers: { authorization: 'Bearer token' } }))
    expect(response.status).toBe(403)
    expect(list).not.toHaveBeenCalled()
  })
})
