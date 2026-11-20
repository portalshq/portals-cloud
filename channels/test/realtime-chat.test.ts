import { afterEach, describe, expect, it, vi } from 'vitest'

const realtime = vi.hoisted(() => ({
  seal: vi.fn(async ({ query }: { query: unknown }) => ({ capability: 'sealed', queryFingerprint: 'chat', expiresAt: 9_999_999_999_999, query })),
  rawSql: vi.fn((sql: string, parameters: unknown[]) => ({ sql, parameters })),
}))

vi.mock('@neon/realtime/server', () => ({
  createRealtime: vi.fn(() => ({ seal: realtime.seal })),
  rawSql: realtime.rawSql,
}))

import { resetRealtimeChatForTest, sealChat } from '../lib/realtime-chat'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  resetRealtimeChatForTest()
})

describe('sealed chat queries', () => {
  it('stays disabled until every server setting is present', async () => {
    await expect(sealChat({ kind: 'program', programId: 'bears' }, 40)).resolves.toBeUndefined()
  })

  it('seals a bounded public query without exposing the secret', async () => {
    vi.stubEnv('CHANNELS_REALTIME_CHAT_ENABLED', 'true')
    vi.stubEnv('NEON_REALTIME_SECRET', 'server-secret')
    vi.stubEnv('NEON_REALTIME_DB', 'central')
    vi.stubEnv('NEXT_PUBLIC_NEON_REALTIME_URL', 'wss://realtime.example/v1')

    const result = await sealChat({ kind: 'program', programId: 'bears' }, 40)

    expect(realtime.rawSql).toHaveBeenCalledWith(expect.stringContaining('program_id = $1'), ['bears', 40])
    expect(result).toMatchObject({ url: 'wss://realtime.example/v1', query: { capability: 'sealed' } })
    expect(JSON.stringify(result)).not.toContain('server-secret')
  })

  it('puts active membership inside the private live query', async () => {
    vi.stubEnv('CHANNELS_REALTIME_CHAT_ENABLED', 'true')
    vi.stubEnv('NEON_REALTIME_SECRET', 'server-secret')
    vi.stubEnv('NEON_REALTIME_DB', 'central')
    vi.stubEnv('NEXT_PUBLIC_NEON_REALTIME_URL', 'wss://realtime.example/v1')

    await sealChat({ kind: 'group', groupId: 'group-id', userId: 'viewer-id' }, 100)

    expect(realtime.rawSql).toHaveBeenCalledWith(expect.stringMatching(/m\.active[\s\S]*LIMIT \$3/), ['group-id', 'viewer-id', 100])
  })
})
