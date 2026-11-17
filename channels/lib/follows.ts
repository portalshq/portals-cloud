import { getViewer, requestSignIn, subscribeViewer, viewerFetch } from './viewer'

/** One reactive source of truth for follow state. Anonymous viewers write to a
 *  localStorage-backed set; signing in merges it into program_follows once and
 *  switches every subscriber to the server set, so feed cards, detail actions
 *  and the room rail always agree. */
const KEY = 'channels:follows'
const listeners = new Set<() => void>()
let anonymous: Set<string> | undefined
let server: ReadonlySet<string> | undefined
let hydrating: Promise<void> | undefined
let merging: Promise<void> | undefined
let watching = false

function notify() {
  for (const listener of listeners) listener()
}

function readAnonymous(): Set<string> {
  if (anonymous) return anonymous
  anonymous = new Set()
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    if (Array.isArray(stored)) for (const id of stored) if (typeof id === 'string') anonymous.add(id)
  } catch { /* Private mode or a corrupt value starts empty. */ }
  return anonymous
}

function persistAnonymous(next: Set<string>) {
  anonymous = next
  try { localStorage.setItem(KEY, JSON.stringify([...next])) } catch { /* This tab still holds the set. */ }
}

function active(): ReadonlySet<string> {
  return server ?? readAnonymous()
}

export function followsSnapshot(): ReadonlySet<string> {
  return active()
}

export function subscribeFollows(listener: () => void) {
  watchViewer()
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function watchViewer() {
  if (watching) return
  watching = true
  subscribeViewer(() => {
    if (getViewer()) void ensureServerFollows()
    else {
      server = undefined
      notify()
    }
  })
}

/** Call from any follow surface so signed-in state hydrates once per page. */
export function ensureFollowsLoaded() {
  if (getViewer()) void ensureServerFollows()
}

function ensureServerFollows(): Promise<void> {
  hydrating ??= (async () => {
    await mergeAnonymousFollows()
    try {
      const response = await viewerFetch('/api/follows')
      const body = await response.json().catch(() => null)
      if (response.ok && Array.isArray(body?.programs)) {
        server = new Set(body.programs.map(String))
        notify()
      }
    } catch { /* The previous snapshot stays until the next load. */ }
  })().finally(() => { hydrating = undefined })
  return hydrating
}

/** POSTs every locally stored follow after sign-in; each entry clears only on
 *  success so a retry later can finish the rest. Concurrent callers share the
 *  same merge. */
function mergeAnonymousFollows(): Promise<void> {
  merging ??= (async () => {
    for (const programId of [...readAnonymous()]) {
      try {
        const response = await viewerFetch('/api/follows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ programId, follow: true }),
        })
        if (response.ok) {
          const remaining = new Set(readAnonymous())
          remaining.delete(programId)
          persistAnonymous(remaining)
        }
      } catch { /* Keep it for the next merge attempt. */ }
    }
  })().finally(() => { merging = undefined })
  return merging
}

/** Applies a follow change for whoever is viewing. Anonymous writes land
 *  immediately; signed-in writes are optimistic and roll back on failure.
 *  Returns the resulting state so callers can react to what actually stuck. */
export async function setFollow(programId: string, follow: boolean): Promise<boolean> {
  if (!getViewer()) {
    const next = new Set(readAnonymous())
    if (follow) next.add(programId)
    else next.delete(programId)
    persistAnonymous(next)
    notify()
    return follow
  }
  void ensureServerFollows()
  const before = active()
  const optimistic = new Set(before)
  if (follow) optimistic.add(programId)
  else optimistic.delete(programId)
  server = optimistic
  notify()
  try {
    const response = await viewerFetch('/api/follows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ programId, follow }),
    })
    if (response.ok) return follow
    server = before
    notify()
    if (response.status === 401) requestSignIn()
    return !follow
  } catch {
    server = before
    notify()
    return !follow
  }
}
