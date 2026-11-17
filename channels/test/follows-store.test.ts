import { beforeEach, describe, expect, it, vi } from 'vitest'

const viewerState = { session: null as { token: string; userId?: string } | null }
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
const ok = () => Promise.resolve(Response.json({ ok: true }))
const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}
/** A fetch mock whose GET snapshots what earlier POSTs wrote, like the real
 *  route over program_follows. */
const serverBacked = (serverSide: Set<string>, override?: (init?: RequestInit) => Promise<Response> | undefined) =>
  (path: string, init?: RequestInit) => {
    const overridden = override?.(init)
    if (overridden) return overridden
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { programId: string; follow: boolean }
      if (body.follow) serverSide.add(body.programId)
      else serverSide.delete(body.programId)
      return ok()
    }
    return Promise.resolve(Response.json({ programs: [...serverSide] }))
  }

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
      if (init?.method === 'POST') return ok()
      return Promise.resolve(Response.json({ programs: ['program-a', 'program-b'] }))
    })
    viewerState.session = { token: 't', userId: 'u' }
    follows.ensureFollowsLoaded()
    await vi.waitFor(() => expect(follows.followsSnapshot().has('program-b')).toBe(true))
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(posts.map(([, init]) => JSON.parse(String(init?.body)).programId)).toEqual(['program-a'])
    expect(JSON.parse(backing.get('channels:follows') ?? '[]')).toEqual([])
  })

  it('drops anonymous entries that can never merge instead of leaving them orphaned', async () => {
    const follows = await loadFollows()
    await follows.setFollow('ghost-program', true)
    const serverSide = new Set<string>()
    fetchMock.mockImplementation(serverBacked(serverSide, (init) =>
      init?.method === 'POST' ? Promise.resolve(Response.json({ error: 'Program not found' }, { status: 404 })) : undefined))
    viewerState.session = { token: 't', userId: 'u' }
    follows.ensureFollowsLoaded()
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => !init?.method || init.method === 'GET')).toBe(true))
    await vi.waitFor(() => expect(JSON.parse(backing.get('channels:follows') ?? '[]')).toEqual([]))
    expect(follows.followsSnapshot().has('ghost-program')).toBe(false)
  })

  it('does not mark a program followed while the follow is still in flight', async () => {
    const follows = await loadFollows()
    viewerState.session = { token: 't', userId: 'u' }
    const serverSide = new Set<string>()
    fetchMock.mockImplementation(serverBacked(serverSide))
    follows.ensureFollowsLoaded()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())

    const request = deferred<Response>()
    fetchMock.mockImplementation(serverBacked(serverSide, (init) =>
      init?.method === 'POST'
        ? request.promise.then((response) => {
            if (response.ok) serverSide.add(JSON.parse(String(init.body)).programId)
            return response
          })
        : undefined))
    const pending = follows.setFollow('program-c', true)
    expect(follows.followsSnapshot().has('program-c')).toBe(false)
    request.resolve(Response.json({ ok: true }))
    expect(await pending).toBe(true)
    expect(follows.followsSnapshot().has('program-c')).toBe(true)
  })

  it('leaves the button unfollowed when the follow fails', async () => {
    const follows = await loadFollows()
    viewerState.session = { token: 't', userId: 'u' }
    const serverSide = new Set<string>()
    fetchMock.mockImplementation(serverBacked(serverSide, (init) =>
      init?.method === 'POST' ? Promise.resolve(new Response('{"error":"x"}', { status: 503 })) : undefined))
    follows.ensureFollowsLoaded()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())

    const seen: boolean[] = []
    follows.subscribeFollows(() => seen.push(follows.followsSnapshot().has('program-c')))
    expect(await follows.setFollow('program-c', true)).toBe(false)
    expect(follows.followsSnapshot().has('program-c')).toBe(false)
    expect(seen).not.toContain(true)
  })

  it('keeps the followed state when an unfollow fails', async () => {
    const follows = await loadFollows()
    viewerState.session = { token: 't', userId: 'u' }
    const serverSide = new Set<string>(['program-d'])
    let failWrites = false
    fetchMock.mockImplementation(serverBacked(serverSide, (init) =>
      init?.method === 'POST' && failWrites
        ? Promise.resolve(new Response('{"error":"x"}', { status: 503 })) : undefined))
    follows.ensureFollowsLoaded()
    await vi.waitFor(() => expect(follows.followsSnapshot().has('program-d')).toBe(true))

    failWrites = true
    expect(await follows.setFollow('program-d', false)).toBe(true)
    expect(follows.followsSnapshot().has('program-d')).toBe(true)
  })

  it('never lets a stale hydration overwrite a confirmed write', async () => {
    const follows = await loadFollows()
    viewerState.session = { token: 't', userId: 'u' }
    const serverSide = new Set<string>()
    const snapshot = deferred<Response>()
    let fetches = 0
    fetchMock.mockImplementation(serverBacked(serverSide, (init) => {
      if (init?.method === 'POST') return undefined
      fetches++
      return fetches === 1 ? snapshot.promise : undefined
    }))
    follows.ensureFollowsLoaded()
    await vi.waitFor(() => expect(fetches).toBe(1))

    // The write commits while the first snapshot is still in flight.
    expect(await follows.setFollow('program-e', true)).toBe(true)
    expect(follows.followsSnapshot().has('program-e')).toBe(true)

    // That snapshot predates the write, so it is discarded for a fresh one.
    snapshot.resolve(Response.json({ programs: [] }))
    await vi.waitFor(() => expect(fetches).toBe(2))
    await vi.waitFor(() => expect(follows.followsSnapshot().has('program-e')).toBe(true))
  })

  it('serializes toggles on the same program so the last click sticks', async () => {
    const follows = await loadFollows()
    viewerState.session = { token: 't', userId: 'u' }
    const serverSide = new Set<string>()
    const writes = deferred<Response>()
    const bodies: Array<{ programId: string; follow: boolean }> = []
    fetchMock.mockImplementation(serverBacked(serverSide, (init) => {
      if (init?.method !== 'POST') return undefined
      bodies.push(JSON.parse(String(init.body)))
      return bodies.length === 1 ? writes.promise : undefined
    }))
    follows.ensureFollowsLoaded()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())

    const first = follows.setFollow('program-f', true)
    const second = follows.setFollow('program-f', false)
    await vi.waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toEqual({ programId: 'program-f', follow: true })
    writes.resolve(Response.json({ ok: true }))
    expect(await first).toBe(true)
    expect(await second).toBe(false)
    await vi.waitFor(() => expect(bodies).toHaveLength(2))
    expect(bodies[1]).toEqual({ programId: 'program-f', follow: false })
    expect(follows.followsSnapshot().has('program-f')).toBe(false)
  })

  it('does not publish a write to a different signed-in identity', async () => {
    const follows = await loadFollows()
    follows.subscribeFollows(() => {})
    viewerState.session = { token: 'a', userId: 'user-a' }
    const serverSide = new Set<string>()
    const request = deferred<Response>()
    fetchMock.mockImplementation(serverBacked(serverSide, (init) =>
      init?.method === 'POST' ? request.promise : undefined))
    follows.ensureFollowsLoaded()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())

    const pending = follows.setFollow('program-g', true)
    // The write goes out under the first identity, then the account changes
    // while it is in flight.
    await vi.waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1))
    viewerState.session = { token: 'b', userId: 'user-b' }
    for (const listener of viewerListeners) listener()
    request.resolve(Response.json({ ok: true }))
    expect(await pending).toBe(true)
    await vi.waitFor(() => expect(follows.followsSnapshot().has('program-g')).toBe(false))
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
