'use client'

import { Bell, Forward, X } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { experienceEvents } from '@/lib/analytics-contract'
import { recordChannelEvent } from '@/lib/analytics-client'
import { ensureFollowsLoaded, followsSnapshot, setFollow, settleReminderFollow, subscribeFollows } from '@/lib/follows'
import type { FollowDialogOutcome } from '@/lib/room-controls'
import { getViewer, subscribeViewer, viewerFetch } from '@/lib/viewer'
import styles from './actions.module.css'

export type FollowReminderResult = { ok: boolean; verified?: boolean; error?: string; settingsUrl?: string }

/** Submits the reminders form that commits a follow. Shared by the default
 *  prompt and any preview-provided styled dialog so the subscription write,
 *  follow settlement, and analytics stay in one place. */
export async function submitFollowReminder(programId: string, { email }: { email?: string } = {}): Promise<FollowReminderResult> {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const payload: Record<string, unknown> = { programId, episode: true, weekly: false, timezone, ensureFollow: true }
  const viewer = getViewer()
  if (!viewer && email?.trim()) payload.email = email.trim()
  try {
    const response = await viewerFetch('/api/notifications/subscriptions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const result = await response.json().catch(() => null)
    if (response.ok) {
      const verified = result?.verified === true
      await settleReminderFollow(programId, verified).catch(() => {})
      recordChannelEvent(experienceEvents.reminderSaveResult, {surface: 'channels_room', program_id: programId, outcome: 'succeeded', episode: true, weekly: false, verification_required: !verified})
      return { ok: true, verified }
    }
    const settingsUrl = typeof result?.settingsUrl === 'string' ? result.settingsUrl : undefined
    recordChannelEvent(experienceEvents.reminderSaveResult, {surface: 'channels_room', program_id: programId, outcome: response.status === 401 ? 'unauthorized' : 'failed', episode: true, weekly: false, verification_required: !viewer})
    return { ok: false, error: result?.error || 'Could not save reminders.', settingsUrl }
  } catch {
    recordChannelEvent(experienceEvents.reminderSaveResult, {surface: 'channels_room', program_id: programId, outcome: 'unavailable', episode: true, weekly: false, verification_required: !getViewer()})
    return { ok: false, error: 'Could not save reminders.' }
  }
}

/** Settles follow state and analytics after a follow dialog completes.
 *  Shared by the reminders prompt and a preview-provided styled dialog so the
 *  bell and the funnel read the same outcome. `succeeded` means the dialog's
 *  flow committed the follow — the same transaction settle as the reminders
 *  form; dismissed or failed dialogs write nothing. */
export async function settleFollowDialog(channel: string, programId: string, outcome: FollowDialogOutcome): Promise<boolean> {
  if (outcome !== 'succeeded') {
    recordChannelEvent(experienceEvents.followResult, {surface: 'channels_room', channel_id: channel, program_id: programId, following: false, outcome})
    return false
  }
  const applied = await settleReminderFollow(programId, true)
  recordChannelEvent(experienceEvents.followResult, {surface: 'channels_room', channel_id: channel, program_id: programId, following: applied, outcome: 'succeeded'})
  return applied
}

/** Following turns the icon chip, not the label. The word stays in normal ink
 *  outside the accent, and the button keeps a fixed width so swapping
 *  "Follow" for "Following" cannot reflow the row.
 *
 *  It renders only for channels bound to a central `programId` — the static
 *  catalog entries carry no program, so there is nothing to follow and no
 *  affordance is offered. When it renders it follows the real program —
 *  shared reactive state keeps every surface in sync: signed-in viewers
 *  through /api/follows, anonymous viewers through local state that merges
 *  into program_follows on sign-in. Following is gated by the reminders
 *  form: the click opens it and the follow commits only when the form
 *  completes — dismissing it cancels the process and the button stays
 *  "Follow". Unfollow is a single immediate write.
 *
 *  When the mounted preview provides its own styled follow dialog, pass
 *  `styledFollow` — the click opens that dialog instead of the default
 *  reminders prompt, and `settleFollowDialog` carries the outcome. */
export function FollowButton({ channel, programId, className, styledFollow }: { channel: string; programId?: string; className?: string; styledFollow?: (() => void) | null }) {
  // The gate is hook-free so a programId arriving after mount — a preview
  // resolving the binding late — cannot reorder the action's hooks.
  if (!programId) return null
  return <FollowAction channel={channel} programId={programId} className={className} styledFollow={styledFollow ?? undefined} />
}

function FollowAction({ channel, programId, className, styledFollow }: { channel: string; programId: string; className?: string; styledFollow?: () => void }) {
  const following = useSyncExternalStore(
    subscribeFollows,
    () => followsSnapshot().has(programId),
    () => false,
  )
  const [busy, setBusy] = useState(false)
  const [promptOpen, setPromptOpen] = useState(false)

  useEffect(() => {
    ensureFollowsLoaded()
  }, [])

  return (
    <>
      <button
        className={`${styles.button} ${styles.follow} ${className ?? ''}`}
        type="button"
        aria-pressed={following}
        disabled={busy}
        onClick={() => {
          if (!following) {
            if (styledFollow) {
              recordChannelEvent(experienceEvents.reminderPromptOpened, {surface: 'channels_room', program_id: programId})
              styledFollow()
              return
            }
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
        <span>{following ? 'Following' : 'Follow'}</span>
      </button>
      <ReminderPrompt
        programId={programId}
        open={promptOpen}
        onClose={() => setPromptOpen(false)}
        onFollowSettled={(applied) => {
          if (applied) recordChannelEvent(experienceEvents.followResult, {surface: 'channels_room', channel_id: channel, program_id: programId, following: true, outcome: 'succeeded'})
        }}
        onCancelled={() => recordChannelEvent(experienceEvents.followResult, {surface: 'channels_room', channel_id: channel, program_id: programId, following: false, outcome: 'cancelled'})}
      />
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
