'use client'

import { Bell, Forward, X } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { channelEvents } from '@/lib/analytics-contract'
import { recordChannelEvent } from '@/lib/analytics-client'
import { ensureFollowsLoaded, followsSnapshot, setFollow, subscribeFollows } from '@/lib/follows'
import { getViewer, subscribeViewer, viewerFetch } from '@/lib/viewer'
import styles from './actions.module.css'

/** Following turns the icon chip, not the label. The word stays in normal ink
 *  outside the accent, and the button keeps a fixed width so swapping
 *  "Follow" for "Following" cannot reflow the row.
 *
 *  When the channel carries a central `programId` the button follows the real
 *  program — shared reactive state keeps every surface in sync: signed-in
 *  viewers through /api/follows, anonymous viewers through local state that
 *  merges into program_follows on sign-in. A successful follow offers email
 *  reminders. Without a `programId` it keeps the in-memory chip state. */
export function FollowButton({ channel, programId, className }: { channel: string; programId?: string; className?: string }) {
  const subscribed = useSyncExternalStore(
    subscribeFollows,
    () => (programId ? followsSnapshot().has(programId) : false),
    () => false,
  )
  const [chipFollowing, setChipFollowing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [promptOpen, setPromptOpen] = useState(false)
  const following = programId ? subscribed : chipFollowing

  useEffect(() => {
    if (programId) ensureFollowsLoaded()
  }, [programId])

  return (
    <>
      <button
        className={`${styles.button} ${styles.follow} ${className ?? ''}`}
        type="button"
        aria-pressed={following}
        disabled={busy}
        onClick={() => {
          const next = !following
          recordChannelEvent(channelEvents.follow, {channel, following: next})
          if (!programId) {
            setChipFollowing(next)
            return
          }
          setBusy(true)
          void setFollow(programId, next)
            .then((applied) => { if (applied === true && next) setPromptOpen(true) })
            .finally(() => setBusy(false))
        }}
      >
        <Bell className="filled" size={16} strokeWidth={1.75} />
        {following ? 'Following' : 'Follow'}
      </button>
      {programId && <ReminderPrompt programId={programId} open={promptOpen} onClose={() => setPromptOpen(false)} />}
    </>
  )
}

/** Offered after a successful follow: signed-in viewers enable reminders in one
 *  tap (the server writes the follow and subscription together); anonymous
 *  viewers leave an email and confirm it via the verification link — the
 *  verified recipient links to their account when they later sign up. */
function ReminderPrompt({ programId, open, onClose }: { programId: string; open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const viewer = useSyncExternalStore(subscribeViewer, getViewer, () => null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')
  const [error, setError] = useState('')
  const [settingsUrl, setSettingsUrl] = useState('')

  useEffect(() => {
    const node = dialog.current
    if (!node) return
    if (open && !node.open) node.showModal()
    if (!open && node.open) node.close()
  }, [open])

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      onClose={onClose}
      onClick={(event) => { if (event.target === dialog.current) dialog.current?.close() }}
    >
      <div className={styles.dialogHeader}>
        <strong>Following</strong>
        <button className={styles.dialogClose} type="button" aria-label="Close" onClick={() => dialog.current?.close()}>
          <X size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      {done ? <p role="status">{done}</p> : (
        <form onSubmit={(event) => {
          event.preventDefault()
          setBusy(true); setError(''); setSettingsUrl('')
          const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
          const payload: Record<string, unknown> = { programId, episode: true, weekly: false, timezone, ensureFollow: true }
          if (!viewer && email.trim()) payload.email = email.trim()
          void viewerFetch('/api/notifications/subscriptions', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
            .then(async (response) => {
              const result = await response.json().catch(() => null)
              if (response.ok) setDone(result?.verified ? 'Reminders are on — we will email you when new episodes air.' : 'Check your email to confirm reminders.')
              else {
                if (typeof result?.settingsUrl === 'string') setSettingsUrl(result.settingsUrl)
                setError(result?.error || 'Could not save reminders.')
              }
            })
            .catch(() => setError('Could not save reminders.'))
            .finally(() => setBusy(false))
        }}>
          <p>Get an email when new episodes air.</p>
          {!viewer && (
            <input type="email" required placeholder="you@example.com" autoComplete="email"
              value={email} onChange={(event) => setEmail(event.target.value)} />
          )}
          <button type="submit" disabled={busy}>{viewer ? 'Turn on reminders' : 'Email me reminders'}</button>
          {error && <p role="alert">{error} {settingsUrl && <a href={settingsUrl}>Open reminder settings</a>}</p>}
        </form>
      )}
    </dialog>
  )
}

/** Fixed for the same reason: "Share" becomes "Link copied". */
export function ShareButton({ url, channel }: { url: string; channel: string }) {
  const [shared, setShared] = useState(false)

  return (
    <button
      className={`${styles.button} ${styles.share}`}
      type="button"
      onClick={() => {
        recordChannelEvent(channelEvents.shareAttempt, {channel})
        // The clipboard rejects in a non-secure context and can be denied by
        // the browser, so only claim success once the write actually lands.
        // `void` on a rejected promise would surface as an unhandled rejection.
        if (!navigator.clipboard) {
          setShared(false)
          recordChannelEvent(channelEvents.shareResult, {channel, outcome: 'failed'})
          return
        }
        navigator.clipboard.writeText(new URL(url, window.location.origin).href)
          .then(() => {
            setShared(true)
            recordChannelEvent(channelEvents.shareResult, {channel, outcome: 'copied'})
          })
          .catch(() => {
            setShared(false)
            recordChannelEvent(channelEvents.shareResult, {channel, outcome: 'failed'})
          })
      }}
    >
      <Forward size={16} strokeWidth={1.75} aria-hidden="true" />
      {shared ? 'Link copied' : 'Share'}
    </button>
  )
}
