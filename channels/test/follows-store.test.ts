import { beforeEach, describe, expect, it, vi } from 'vitest'

const viewerState = { session: null as { token: string } | null }
const viewerListeners = new Set<() => void>()
const fetchMock = vi.fn()

vi.mock('../lib/viewer', () => ({
  getViewer: () => viewerState.session,
  subscribeViewer: (listener: () => void) => { viewerListeners.add(listener); return () => { viewerListeners.delete(listener) } },
  requestSignIn: vi.fn(),
  viewerFetch: (path: string, init?: RequestInit) => fetchMock(path, init),
}))

const backing = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => backing.get(key) ?? null,
  setItem: (key: string, value: string) => { backing.set(key, value) },
  removeItem: (key: string) => { backing.delete(key) },
})

const loadFollows = () => import('../lib/follows')

beforeEach(() => {
  vi.resetModules()
  backing.clear()
  viewerState.session = null
  viewerListeners.clear()
  fetchMock.mockReset()
})

describe('follows store', () => {
  it('persists anonymous follows to localStorage and notifies subscribers', async () => {
    const follows = await loadFollows()
    const seen: boolean[] = []
    follows.subscribeFollows(() => seen.push(follows.followsSnapshot().has('program-a')))
    await follows.setFollow('program-a', true)
    expect(follows.followsSnapshot().has('program-a')).toBe(true)
    expect(JSON.parse(backing.get('channels:follows') ?? '[]')).toEqual(['program-a'])
    expect(seen).toEqual([true])
    await follows.setFollow('program-a', false)
    expect(follows.followsSnapshot().has('program-a')).toBe(false)
  })

  it('merges anonymous follows into program_follows on sign-in then serves the server set', async () => {
    const follows = await loadFollows()
    await follows.setFollow('program-a', true)
    fetchMock.mockImplementation((path: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve(new Response('{}', { status: 200 }))
      return Promise.resolve(Response.json({ programs: ['program-a', 'program-b'] }))
    })
    viewerState.session = { token: 't' }
    follows.ensureFollowsLoaded()
    await vi.waitFor(() => expect(follows.followsSnapshot().has('program-b')).toBe(true))
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(posts.map(([, init]) => JSON.parse(String(init?.body)).programId)).toEqual(['program-a'])
    expect(JSON.parse(backing.get('channels:follows') ?? '[]')).toEqual([])
  })

  it('applies signed-in toggles optimistically and rolls back on failure', async () => {
    const follows = await loadFollows()
    fetchMock.mockResolvedValueOnce(Response.json({ programs: [] }))
    viewerState.session = { token: 't' }
    follows.ensureFollowsLoaded()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    fetchMock.mockResolvedValueOnce(new Response('{"error":"x"}', { status: 503 }))
    const result = await follows.setFollow('program-c', true)
    expect(result).toBe(false)
    expect(follows.followsSnapshot().has('program-c')).toBe(false)
  })

  it('keeps every subscriber consistent for the same program', async () => {
    const follows = await loadFollows()
    const rail: boolean[] = []
    const feed: boolean[] = []
    follows.subscribeFollows(() => rail.push(follows.followsSnapshot().has('p')))
    follows.subscribeFollows(() => feed.push(follows.followsSnapshot().has('p')))
    await follows.setFollow('p', true)
    expect(rail).toEqual([true])
    expect(feed).toEqual([true])
  })
})
