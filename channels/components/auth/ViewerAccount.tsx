'use client'

import { ChevronDown, UserRound } from 'lucide-react'
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { consumeUsernamePrompt, finishSignIn, getViewer, setDisplayName, signOut, startSignIn, subscribeViewer, viewerFetch } from '@/lib/viewer'
import type { RoomAccount } from '@/lib/room-controls'
import styles from './ViewerAccount.module.css'

export function ViewerAccount({ roomAccount, menuAction }: { roomAccount?: RoomAccount | null; menuAction?: ReactNode }) {
  const menuId = `channels-account-menu-${useId().replace(/:/g, '')}`
  const viewer = useSyncExternalStore(subscribeViewer, getViewer, () => null)
  const root = useRef<HTMLDivElement>(null)
  const accountButton = useRef<HTMLButtonElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [name, setName] = useState('')
  const [fetchedBalance, setFetchedBalance] = useState<number | null>(null)
  const balance = roomAccount?.balance ?? fetchedBalance

  useEffect(() => {
    if (roomAccount?.balance != null) {
      setFetchedBalance(roomAccount.balance)
      return
    }
    let active = true
    async function refreshBalance() {
      try {
        const guestToken = readBearsGuestToken()
        if (viewer?.token && guestToken) {
          try {
            const claim = await viewerFetch('/api/channels/bears/interactions/guest/claim', {
              method: 'POST', headers: { 'X-Guest-Token': guestToken },
            })
            if (claim.ok) clearBearsGuestToken()
          } catch { /* A failed guest claim must not block the signed-in balance read. */ }
        }

        let token = viewer?.token ? null : readBearsGuestToken()
        if (!viewer?.token && !token) {
          const response = await viewerFetch('/api/channels/bears/channel')
          if (!response.ok) throw new Error('Could not initialize viewer credits')
          const data = await response.json() as { guestToken?: string | null }
          if (data.guestToken) {
            token = data.guestToken
            saveBearsGuestToken(token)
          }
        }

        const headers = new Headers()
        if (token) headers.set('X-Guest-Token', token)
        const response = await viewerFetch('/api/channels/bears/guides/balance', { headers })
        if (!response.ok) throw new Error('Could not read viewer credits')
        const data = await response.json() as { balance?: unknown }
        if (active) setFetchedBalance(typeof data.balance === 'number' ? data.balance : null)
      } catch {
        if (active) setFetchedBalance(null)
      }
    }
    void refreshBalance()
    return () => { active = false }
  }, [viewer?.token, roomAccount?.balance, menuOpen])

  useEffect(() => {
    const show = () => setMenuOpen(true)
    window.addEventListener('channels:open-account', show)
    return () => window.removeEventListener('channels:open-account', show)
  }, [])

  useEffect(() => {
    if (consumeUsernamePrompt()) {
      setEditingName(true)
      setMenuOpen(true)
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (root.current?.contains(document.activeElement)) accountButton.current?.focus()
      setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  async function perform(action: () => Promise<unknown>) {
    if (busy) return
    setBusy(true)
    setNotice('')
    try {
      await action()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Sign-in is unavailable right now.')
    } finally {
      setBusy(false)
    }
  }

  const action = menuAction ? <div className={styles.menuAction}>{menuAction}</div> : null

  return (
    <div className={styles.root} ref={root} data-account-menu-open={menuOpen ? 'true' : undefined} onClick={event => {
      // A click that starts on the trigger and ends on the moving spacer
      // targets their common ancestor.
      if (event.target === event.currentTarget) setMenuOpen(false)
    }}>
      <button type="button" className={styles.account} ref={accountButton}
        onClick={() => setMenuOpen(value => !value)}
        aria-expanded={menuOpen} aria-controls={menuId}
        aria-label={viewer ? 'Your account' : 'Sign in'} title={viewer ? 'Your account' : 'Sign in'}>
        <span>{viewer?.displayName || (viewer ? <UserRound size={18} aria-hidden="true" /> : 'Sign in')}</span>
        {viewer && <ChevronDown size={15} aria-hidden="true" className={styles.arrow} />}
      </button>
      <div id={menuId} className={styles.menu} role="group" aria-label="Account menu" onClick={event => {
        // While the shell moves, pointerdown and pointerup can land on the
        // shell and spacer respectively, making the shell the click target.
        if (event.target === event.currentTarget) setMenuOpen(value => !value)
      }}>
        <div className={styles.spacer}>
          <div className={styles.menuSummary} aria-hidden={!menuOpen}>
            <strong>{viewer?.displayName || (viewer ? 'Your account' : 'guest')}</strong>
            <span className={styles.credits}>
              <CreditCoin amount={balance ?? null} />
              <span aria-hidden="true">{balance == null ? 'Credits' : 'credits'}</span>
            </span>
          </div>
          <button type="button" className={styles.spacerButton}
            onClick={() => setMenuOpen(value => !value)}
            aria-expanded={menuOpen} aria-controls={menuId}
            aria-label={menuOpen ? 'Close account menu' : 'Open account menu'} />
        </div>
        <div className={styles.menuInner} inert={!menuOpen}>
          {viewer ? (
            <>
              {action}
              {roomAccount?.invite && (
                <button type="button" className={styles.action} onClick={() => {
                  roomAccount.invite?.run()
                  setMenuOpen(false)
                }}>
                  {roomAccount.invite.label}
                </button>
              )}
              {!viewer.displayName && (editingName ? (
                <form className={styles.nameForm} onSubmit={event => {
                  event.preventDefault()
                  void perform(async () => {
                    await setDisplayName(name)
                    setName('')
                    setEditingName(false)
                    setMenuOpen(false)
                  })
                }}>
                  <label htmlFor={menuId + '-username'}>Username</label>
                  <input id={menuId + '-username'} value={name} onChange={event => setName(event.target.value)} maxLength={64} required />
                  <button type="submit" className={styles.action} disabled={busy}>Save</button>
                </form>
              ) : (
                <button type="button" className={styles.action} onClick={() => setEditingName(true)}>Set username</button>
              ))}
              <a className={styles.action} href="/account/notifications">Followed shows &amp; reminders</a>
              <button type="button" className={styles.action} disabled={busy} onClick={() => {
                void perform(async () => {
                  await signOut()
                  setMenuOpen(false)
                })
              }}>Sign out</button>
            </>
          ) : (
            <>
              {action}
              <button type="button" className={styles.action} disabled={busy} onClick={() => void perform(startSignIn)}>Sign in</button>
            </>
          )}
          {notice && <p className={styles.notice} role="alert">{notice}</p>}
        </div>
        <CreditCoin amount={balance} decorative className={styles.cornerCoin} />
      </div>
    </div>
  )
}

const BEARS_GUEST_TOKEN = 'bears:guest-token'

function readBearsGuestToken() {
  try {
    const token = localStorage.getItem(BEARS_GUEST_TOKEN)
    return token?.startsWith('gt1.') ? token : null
  } catch { return null }
}

function saveBearsGuestToken(token: string) {
  try { localStorage.setItem(BEARS_GUEST_TOKEN, token) } catch { /* Storage can be unavailable. */ }
}

function clearBearsGuestToken() {
  try { localStorage.removeItem(BEARS_GUEST_TOKEN) } catch { /* Storage can be unavailable. */ }
}

function CreditCoin({ amount, decorative = false, className }: { amount: number | null; decorative?: boolean; className?: string }) {
  const arcId = `channel-credit-arc-${useId().replace(/:/g, '')}`
  return (
    <svg className={`${styles.creditCoin} ${className ?? ''}`} viewBox="0 0 48 48" focusable="false"
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': amount === null ? 'Credits' : `${amount} credit${amount === 1 ? '' : 's'}` })}>
      <defs><path id={arcId} d="M 8 38 A 90 36 0 0 0 42 37" fill="none" /></defs>
      <text className={styles.creditAmount} fontSize={amount !== null && amount >= 100 ? 22 : 28} fontWeight="600">
        <textPath href={`#${arcId}`} startOffset="50%" textAnchor="middle">{amount ?? '…'}</textPath>
      </text>
    </svg>
  )
}

export function SignInCompletion() {
  const started = useRef(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (started.current) return
    started.current = true
    void finishSignIn().then(path => location.replace(path)).catch(() => setError('Sign-in did not complete. Try again.'))
  }, [])
  return (
    <main className={styles.completion}>
      <p role="status">{error || 'Signing in…'}</p>
      {error && <a href="/">Return to Channels</a>}
    </main>
  )
}
