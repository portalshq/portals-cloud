'use client'

import { UserRound } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { finishSignIn, getViewer, setDisplayName, signOut, startSignIn, subscribeViewer } from '@/lib/viewer'
import styles from './ViewerAccount.module.css'

export function ViewerAccount() {
  const viewer = useSyncExternalStore(subscribeViewer, getViewer, () => null)
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [name, setName] = useState('')

  useEffect(() => {
    const show = () => setOpen(true)
    window.addEventListener('channels:open-account', show)
    return () => window.removeEventListener('channels:open-account', show)
  }, [])

  useEffect(() => {
    if (viewer && !viewer.displayName) setOpen(true)
  }, [viewer?.displayName, Boolean(viewer)])

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal()
    if (!open && dialog.current?.open) dialog.current.close()
  }, [open])

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

  return (
    <>
      <button type="button" className={styles.account} onClick={() => setOpen(true)}
        aria-label={viewer ? 'Your account' : 'Sign in'} title={viewer ? 'Your account' : 'Sign in'}>
        <UserRound size={18} aria-hidden="true" />
      </button>
      <dialog ref={dialog} className={styles.dialog} aria-label="Your account" onClose={() => setOpen(false)}>
        <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close account">×</button>
        {viewer ? (
          <>
            {viewer.displayName ? <strong>{viewer.displayName}</strong> : (
              <form onSubmit={event => {
                event.preventDefault()
                void perform(() => setDisplayName(name))
              }}>
                <label htmlFor="viewer-display-name">Display name</label>
                <input id="viewer-display-name" value={name} onChange={event => setName(event.target.value)} maxLength={64} required />
                <button type="submit" disabled={busy}>Save</button>
              </form>
            )}
            <button type="button" disabled={busy} onClick={() => void perform(signOut)}>Sign out</button>
          </>
        ) : (
          <button type="button" disabled={busy} onClick={() => void perform(startSignIn)}>Sign in</button>
        )}
        {notice && <p role="alert">{notice}</p>}
      </dialog>
    </>
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
