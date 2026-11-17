'use client'

import { Bell, Forward, X } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { experienceEvents } from '@/lib/analytics-contract'
import { recordChannelEvent } from '@/lib/analytics-client'
import { ensureFollowsLoaded, followsSnapshot, setFollow, settleReminderFollow, subscribeFollows } from '@/lib/follows'
import { getViewer, subscribeViewer, viewerFetch } from '@/lib/viewer'
import styles from './actions.module.css'

/** Following turns the icon chip, not the label. The word stays in normal ink
 *  outside the accent, and the button keeps a fixed width so swapping
 *  "Follow" for "Following" cannot reflow the row.
 *
 *  When the channel carries a central `programId` the button follows the real
 *  program — shared reactive state keeps every surface in sync: signed-in
 *  viewers through /api/follows, anonymous viewers through local state that
 *  merges into program_follows on sign-in. Following is gated by the reminders
 *  form: the click opens it and the follow commits only when the form
 *  completes — dismissing it cancels the process and the button stays
 *  "Follow". Unfollow is a single immediate write. Without a `programId` it
 *  keeps the in-memory chip state. */
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
          if (!programId) {
            setChipFollowing(next)
            recordChannelEvent(experienceEvents.followResult, {surface: 'channels_room', channel_id: channel, following: next, outcome: 'succeeded'})
            return
          }
          if (next) {
            setPromptOpen(true)
            return
          }
          setBusy(true)
          void setFollow(programId, false)
            .then((applied) => recordChannelEvent(experienceEvents.followResult, {surface: 'channels_room', channel_id: channel, program_id: programId, following: applied, outcome: applied === false ? 'succeeded' : 'failed'}))
            .catch(() => recordChannelEvent(experienceEvents.followResult, {surface: 'channels_room', channel_id: channel, program_id: programId, following: true, outcome: 'unavailable'}))
            .finally(() => setBusy(false))
        }}
      >
        <Bell className={following ? "filled" : ""} size={16} strokeWidth={1.75} />
        {following ? 'Following' : 'Follow'}
      </button>
      {programId && (
        <ReminderPrompt
          programId={programId}
          open={promptOpen}
          onClose={() => setPromptOpen(false)}
          onFollowSettled={(applied) => {
            if (applied) recordChannelEvent(experienceEvents.followResult, {surface: 'channels_room', channel_id: channel, program_id: programId, following: true, outcome: 'succeeded'})
          }}
          onCancelled={() => recordChannelEvent(experienceEvents.followResult, {surface: 'channels_room', channel_id: channel, program_id: programId, following: false, outcome: 'cancelled'})}
        />
      )}
    </>
  )
}

/** The form that completes a follow: submitting it commits the follow — a
 *  verified response means the subscription transaction already wrote
 *  program_follows, a guest's email is this browser's truth, and a signed-in
 *  verification lands the write on claim. Closing before a successful submit
 *  cancels the process: nothing was written, so the button stays "Follow". */
function ReminderPrompt({ programId, open, onClose, onFollowSettled, onCancelled }: {
  programId: string
  open: boolean
  onClose: () => void
  onFollowSettled?: (applied: boolean) => void
  onCancelled?: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const viewer = useSyncExternalStore(subscribeViewer, getViewer, () => null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')
  const [error, setError] = useState('')
  const [settingsUrl, setSettingsUrl] = useState('')
  const completed = useRef(false)

  useEffect(() => {
    const node = dialog.current
    if (!node) return
    if (open && !node.open) node.showModal()
    if (!open && node.open) node.close()
    if (open) {
      // Each open is a fresh attempt — a stale "done" would hide the form.
      completed.current = false
      setDone('')
      setError('')
      setSettingsUrl('')
      recordChannelEvent(experienceEvents.reminderPromptOpened, {surface: 'channels_room', program_id: programId})
    }
  }, [open])

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      onClose={() => {
        if (!completed.current) onCancelled?.()
        onClose()
      }}
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
              if (response.ok) {
                completed.current = true
                setDone(result?.verified ? 'Reminders are on — we will email you when new episodes air.' : 'Check your email to confirm reminders.')
                void settleReminderFollow(programId, result?.verified === true)
                  .then((applied) => onFollowSettled?.(applied))
                  .catch(() => onFollowSettled?.(false))
                recordChannelEvent(experienceEvents.reminderSaveResult, {surface: 'channels_room', program_id: programId, outcome: 'succeeded', episode: true, weekly: false, verification_required: result?.verified !== true})
              }
              else {
                if (typeof result?.settingsUrl === 'string') setSettingsUrl(result.settingsUrl)
                setError(result?.error || 'Could not save reminders.')
                recordChannelEvent(experienceEvents.reminderSaveResult, {surface: 'channels_room', program_id: programId, outcome: response.status === 401 ? 'unauthorized' : 'failed', episode: true, weekly: false, verification_required: !viewer})
              }
            })
            .catch(() => {
              setError('Could not save reminders.')
              recordChannelEvent(experienceEvents.reminderSaveResult, {surface: 'channels_room', program_id: programId, outcome: 'unavailable', episode: true, weekly: false, verification_required: !viewer})
            })
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
        // The clipboard rejects in a non-secure context and can be denied by
        // the browser, so only claim success once the write actually lands.
        // `void` on a rejected promise would surface as an unhandled rejection.
        if (!navigator.clipboard) {
          setShared(false)
          recordChannelEvent(experienceEvents.shareResult, {surface: 'channels_room', channel_id: channel, share_kind: 'channel', outcome: 'unavailable'})
          return
        }
        navigator.clipboard.writeText(new URL(url, window.location.origin).href)
          .then(() => {
            setShared(true)
            recordChannelEvent(experienceEvents.shareResult, {surface: 'channels_room', channel_id: channel, share_kind: 'channel', outcome: 'succeeded'})
          })
          .catch(() => {
            setShared(false)
            recordChannelEvent(experienceEvents.shareResult, {surface: 'channels_room', channel_id: channel, share_kind: 'channel', outcome: 'failed'})
          })
      }}
    >
      <Forward size={16} strokeWidth={1.75} aria-hidden="true" />
      {shared ? 'Link copied' : 'Share'}
    </button>
  )
}
