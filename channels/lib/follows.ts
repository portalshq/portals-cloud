import { getViewer, requestSignIn, subscribeViewer, viewerFetch } from './viewer'

type Viewer = ReturnType<typeof getViewer>

/** One reactive source of truth for follow state. Anonymous viewers write to a
 *  localStorage-backed set; signing in merges it into program_follows once and
 *  switches every subscriber to the server set, so feed cards, detail actions
 *  and the room rail always agree.
 *
 *  The store only ever reflects confirmed state: a signed-in write posts to
 *  /api/follows first and moves the snapshot solely after the server accepts,
 *  so a pending, failed, or superseded request never changes the button. */
const KEY = 'channels:follows'
const listeners = new Set<() => void>()
let anonymous: Set<string> | undefined
let server: ReadonlySet<string> | undefined
let hydrating: Promise<void> | undefined
let merging: Promise<void> | undefined
let watching = false
/** Bumped by every confirmed write; a hydration whose snapshot predates the
 *  current revision takes a fresh one instead of publishing stale state. */
let writeRevision = 0
/** Serializes writes per program so the last click is the state that sticks. */
const pendingMutations = new Map<string, Promise<boolean>>()

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

/** The session that authorized a request. A refresh keeps the same userId;
 *  sign-out, sign-in, and account switches do not — so state authorized or
 *  fetched as one identity is never applied to another. */
function sameViewerIdentity(a: Viewer, b: Viewer): boolean {
  if (a === b) return true
  return a?.userId !== undefined && a.userId === b?.userId
}

/** Which session the store is showing. userId survives token refreshes; the
 *  session object itself is the fallback when the gateway omits it. */
function viewerIdentity(viewer: Viewer): Viewer | string | null {
  return viewer ? viewer.userId ?? viewer : null
}

export function subscribeFollows(listener: () => void) {
  watchViewer()
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function watchViewer() {
  if (watching) return
  watching = true
  let identity: Viewer | string | null | undefined
  subscribeViewer(() => {
    const viewer = getViewer()
    const next = viewerIdentity(viewer)
    if (next !== identity) {
      // A different identity gets no state from the previous one.
      identity = next
      server = undefined
      notify()
    }
    if (viewer) void ensureServerFollows()
  })
}

/** Call from any follow surface so signed-in state hydrates once per page. */
export function ensureFollowsLoaded() {
  if (getViewer()) void ensureServerFollows()
}

function ensureServerFollows(): Promise<void> {
  hydrating ??= (async () => {
    await mergeAnonymousFollows()
    // A write can commit while a fetch is in flight; retry once so the applied
    // snapshot always postdates it. Committed writes publish themselves, so
    // giving up after the retry still leaves an accurate snapshot.
    for (let attempt = 0; attempt < 2; attempt++) {
      const requestedAs = getViewer()
      if (!requestedAs) return
      const revisionAtStart = writeRevision
      try {
        const response = await viewerFetch('/api/follows')
        const body = await response.json().catch(() => null)
        if (!response.ok || !Array.isArray(body?.programs)) return
        if (!sameViewerIdentity(getViewer(), requestedAs)) continue
        if (revisionAtStart === writeRevision) {
          server = new Set(body.programs.map(String))
          notify()
          return
        }
      } catch { return /* The previous snapshot stays until the next load. */ }
    }
  })().finally(() => { hydrating = undefined })
  return hydrating
}

/** POSTs every locally stored follow after sign-in; each entry clears on
 *  success or on a rejection that can never succeed (a deleted program, a
 *  payload the route refuses), so retryable failures transfer later and dead
 *  ones stop reporting a follow the server can never hold. Concurrent callers
 *  share the same merge. */
function mergeAnonymousFollows(): Promise<void> {
  merging ??= (async () => {
    for (const programId of [...readAnonymous()]) {
      try {
        const response = await viewerFetch('/api/follows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ programId, follow: true }),
        })
        if (response.ok || response.status === 400 || response.status === 404) {
          const remaining = new Set(readAnonymous())
          remaining.delete(programId)
          persistAnonymous(remaining)
        }
      } catch { /* Keep it for the next merge attempt. */ }
    }
  })().finally(() => { merging = undefined })
  return merging
}

/** Publishes a follow that a sibling route already committed — the reminders
 *  subscription writes program_follows inside its own transaction for verified
 *  recipients — so every surface updates without a redundant write. */
export function confirmFollow(programId: string, follow: boolean) {
  if (!getViewer()) return
  writeRevision++
  const committed = new Set(active())
  if (follow) committed.add(programId)
  else committed.delete(programId)
  server = committed
  notify()
}

/** Settles a follow after the reminders form completes the process: a verified
 *  subscription response already wrote program_follows in its transaction, a
 *  guest's submitted email is this browser's truth, and a signed-in viewer
 *  whose address still needs verifying stays unfollowed until the claim lands
 *  the write. Returns whether the program now reads as followed. */
export async function settleReminderFollow(programId: string, verified: boolean): Promise<boolean> {
  if (!getViewer()) return setFollow(programId, true)
  if (!verified) return active().has(programId)
  confirmFollow(programId, true)
  return true
}

/** Applies a follow change for whoever is viewing. Anonymous writes land
 *  immediately because local storage is the whole process; signed-in writes
 *  commit only after the server confirms. Returns the state that stuck. */
export function setFollow(programId: string, follow: boolean): Promise<boolean> {
  const viewer = getViewer()
  if (!viewer) {
    const next = new Set(readAnonymous())
    if (follow) next.add(programId)
    else next.delete(programId)
    persistAnonymous(next)
    notify()
    return Promise.resolve(follow)
  }
  void ensureServerFollows()
  const prior = pendingMutations.get(programId) ?? Promise.resolve(false)
  const mutation = prior.catch(() => false).then(() => commitFollow(programId, follow, viewer))
  pendingMutations.set(programId, mutation)
  void mutation.finally(() => {
    if (pendingMutations.get(programId) === mutation) pendingMutations.delete(programId)
  })
  return mutation
}

/** Sends one write and only then moves the snapshot — the button never shows
 *  a state the server has not confirmed, and a failed or cancelled request
 *  leaves every surface exactly where it was. Queued writes made under a
 *  previous identity are dropped rather than applied to the account that
 *  happens to be signed in when they run. */
async function commitFollow(programId: string, follow: boolean, expected: Viewer): Promise<boolean> {
  const viewer = getViewer()
  if (!sameViewerIdentity(viewer, expected)) return active().has(programId)
  try {
    const response = await viewerFetch('/api/follows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ programId, follow }),
    })
    if (!response.ok) {
      if (response.status === 401) requestSignIn()
      return active().has(programId)
    }
    writeRevision++
    // Publish only to the identity that authorized the write; a session change
    // mid-flight rehydrates instead of inheriting another account's state.
    if (sameViewerIdentity(getViewer(), viewer)) {
      const committed = new Set(active())
      if (follow) committed.add(programId)
      else committed.delete(programId)
      server = committed
      notify()
    }
    return follow
  } catch {
    return active().has(programId)
  }
}
