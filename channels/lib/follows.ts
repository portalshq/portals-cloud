import { viewerFetch } from './viewer'

/** Anonymous follows live in localStorage until a viewer signs in; signing in
 *  merges them into central program_follows once, then the server owns state. */
const KEY = 'channels:follows'
const listeners = new Set<() => void>()
let cache: Set<string> | undefined

function read(): Set<string> {
  if (cache) return cache
  cache = new Set()
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    if (Array.isArray(stored)) for (const id of stored) if (typeof id === 'string') cache.add(id)
  } catch { /* Private mode or a corrupt value starts empty. */ }
  return cache
}

export function followsSnapshot(): ReadonlySet<string> {
  return read()
}

export function subscribeFollows(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function setAnonymousFollow(programId: string, follow: boolean) {
  const next = new Set(read())
  if (follow) next.add(programId)
  else next.delete(programId)
  cache = next
  try { localStorage.setItem(KEY, JSON.stringify([...next])) } catch { /* This tab still holds the set. */ }
  for (const listener of listeners) listener()
}

let merging: Promise<void> | undefined

/** POSTs every locally stored follow after sign-in; each entry clears only on
 *  success so a retry later (or next mount) can finish the rest. Runs once —
 *  concurrent callers share the same merge. */
export function mergeAnonymousFollows(): Promise<void> {
  merging ??= (async () => {
    for (const programId of [...read()]) {
      try {
        const response = await viewerFetch('/api/follows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ programId, follow: true }),
        })
        if (response.ok) {
          const remaining = new Set(read())
          remaining.delete(programId)
          cache = remaining
          try { localStorage.setItem(KEY, JSON.stringify([...remaining])) } catch { /* ignore */ }
        }
      } catch { /* Keep it for the next merge attempt. */ }
    }
    for (const listener of listeners) listener()
  })().finally(() => { merging = undefined })
  return merging
}
