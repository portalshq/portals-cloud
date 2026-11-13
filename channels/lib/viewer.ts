type Session = { userId?: string; token: string; refreshToken: string | null; expiresAt: number | null; displayName: string | null }
const SESSION = 'channels:viewer'
const HANDOFF = 'channels:sign-in'
const USERNAME_PROMPT = 'channels:username-prompt'
const listeners = new Set<() => void>()
let current: Session | null | undefined
let sessionVersion = 0
let rotation: Promise<'refreshed' | 'rejected' | 'unavailable'> | undefined

export function getViewer(): Session | null {
  if (current !== undefined) return current
  if (typeof window === 'undefined') return null
  try {
    const stored = JSON.parse(localStorage.getItem(SESSION) ?? 'null')
    current = typeof stored?.token === 'string' ? stored : null
  } catch {
    current = null
  }
  return current ?? null
}

export function subscribeViewer(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function save(next: Session | null) {
  current = next
  try {
    if (next) localStorage.setItem(SESSION, JSON.stringify(next))
    else localStorage.removeItem(SESSION)
  } catch { /* The current tab can still use the session. */ }
  for (const listener of listeners) listener()
}

async function post(action: string, body?: unknown, token?: string) {
  return fetch('/api/auth/' + action, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify(body ?? {}),
  })
}

export function requestSignIn() {
  window.dispatchEvent(new Event('channels:open-account'))
}

export async function startSignIn() {
  const response = await post('start')
  const data = await response.json()
  if (!response.ok) throw new Error(data.error)
  const returnTo = location.pathname + location.search + location.hash
  sessionStorage.setItem(HANDOFF, JSON.stringify({ state: data.state, sessionCode: data.sessionCode, returnTo }))
  location.assign(data.loginUrl)
}

export function consumeUsernamePrompt(): boolean {
  try {
    const pending = sessionStorage.getItem(USERNAME_PROMPT)
    sessionStorage.removeItem(USERNAME_PROMPT)
    const viewer = getViewer()
    if (!viewer || viewer.displayName || pending !== 'pending') return false
    if (viewer.userId) {
      const seen = `${USERNAME_PROMPT}:${viewer.userId}`
      try {
        if (localStorage.getItem(seen)) return false
        localStorage.setItem(seen, 'seen')
      } catch { /* The prompt is still consumed for this tab. */ }
    }
    return true
  } catch {
    return false
  }
}

export async function finishSignIn() {
  const params = new URLSearchParams(location.search)
  const pending = JSON.parse(sessionStorage.getItem(HANDOFF) ?? 'null')
  sessionStorage.removeItem(HANDOFF)
  history.replaceState(history.state, '', location.pathname)
  if (!pending || params.get('error') || pending.state !== params.get('state')
    || pending.sessionCode !== params.get('session_code')) throw new Error('Sign-in did not complete. Try again.')
  const response = await post('complete', { sessionCode: pending.sessionCode, state: pending.state })
  if (!response.ok) throw new Error('Sign-in did not complete. Try again.')
  const viewer: Session = await response.json()
  sessionVersion++
  save(viewer)
  if (viewer.displayName) sessionStorage.removeItem(USERNAME_PROMPT)
  else sessionStorage.setItem(USERNAME_PROMPT, 'pending')
  return typeof pending.returnTo === 'string' && /^\/(?![\/\\])/.test(pending.returnTo) ? pending.returnTo : '/'
}

export async function signOut() {
  const pending = rotation
  const credential = getViewer()?.refreshToken
  sessionVersion++
  save(null)
  await pending
  if (credential) await post('sign-out', { refreshToken: credential }).catch(() => {})
}

function refresh() {
  if (rotation) return rotation
  const original = getViewer()
  if (!original?.refreshToken) return Promise.resolve('rejected' as const)
  rotation = (async () => {
    try {
      const response = await post('refresh', { refreshToken: original.refreshToken })
      if (response.status === 400 || response.status === 401) return 'rejected' as const
      if (!response.ok) return 'unavailable' as const
      const next: Session = await response.json()
      const viewer = getViewer()
      if (viewer && viewer.refreshToken === original.refreshToken) {
        save({ ...next, displayName: next.displayName || viewer.displayName })
      } else if (next.refreshToken) await post('sign-out', { refreshToken: next.refreshToken }).catch(() => {})
      return 'refreshed' as const
    } catch {
      return 'unavailable' as const
    }
  })().finally(() => { rotation = undefined })
  return rotation
}

export async function viewerFetch(path: string, init: RequestInit = {}) {
  const original = getViewer()
  const version = sessionVersion
  const send = (token?: string) => {
    const headers = new Headers(init.headers)
    if (token) headers.set('Authorization', 'Bearer ' + token)
    return fetch(path, { ...init, headers })
  }
  const response = await send(original?.token)
  if (!original || response.status !== 401 || version !== sessionVersion) return response
  const outcome = getViewer() === original ? await refresh() : 'refreshed'
  if (outcome === 'unavailable' || version !== sessionVersion) return response
  if (outcome === 'rejected') {
    if (getViewer() === original) save(null)
    return response
  }
  const next = getViewer()
  if (!next) return response
  const retry = await send(next.token)
  if (retry.status === 401 && getViewer() === next) save(null)
  return retry
}

export async function setDisplayName(displayName: string) {
  const version = sessionVersion
  const response = await viewerFetch('/api/auth/display-name', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName }),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error)
  const viewer = getViewer()
  if (viewer && version === sessionVersion) save({ ...viewer, displayName: result.displayName })
}
