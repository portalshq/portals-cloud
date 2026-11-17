'use client'

import { Bell, Forward } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { channelEvents } from '@/lib/analytics-contract'
import { recordChannelEvent } from '@/lib/analytics-client'
import { followsSnapshot, mergeAnonymousFollows, setAnonymousFollow, subscribeFollows } from '@/lib/follows'
import { getViewer, requestSignIn, subscribeViewer, viewerFetch } from '@/lib/viewer'
import styles from './actions.module.css'

/** Following turns the icon chip, not the label. The word stays in normal ink
 *  outside the accent, and the button keeps a fixed width so swapping
 *  "Follow" for "Following" cannot reflow the row.
 *
 *  When the channel carries a central `programId` the button follows the real
 *  program: signed-in viewers through /api/follows, anonymous viewers through
 *  local state that merges into program_follows on sign-in. Without a
 *  `programId` it keeps the in-memory chip state. */
export function FollowButton({ channel, programId, className }: { channel: string; programId?: string; className?: string }) {
  const session = useSyncExternalStore(subscribeViewer, getViewer, () => null)
  const anonymousFollowing = useSyncExternalStore(
    subscribeFollows,
    () => (programId ? followsSnapshot().has(programId) : false),
    () => false,
  )
  const [serverFollowing, setServerFollowing] = useState(false)
  const [chipFollowing, setChipFollowing] = useState(false)
  const [busy, setBusy] = useState(false)
  const following = programId ? (session ? serverFollowing : anonymousFollowing) : chipFollowing

  useEffect(() => {
    if (!session || !programId) {
      setServerFollowing(false)
      return
    }
    let live = true
    void mergeAnonymousFollows()
      .then(() => viewerFetch('/api/follows'))
      .then(async (response) => {
        if (!response.ok || !live) return
        const body = await response.json().catch(() => null)
        if (live && Array.isArray(body?.programs)) setServerFollowing(body.programs.includes(programId))
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [session, programId])

  return (
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
        if (!session) {
          setAnonymousFollow(programId, next)
          return
        }
        setBusy(true)
        void viewerFetch('/api/follows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ programId, follow: next }),
        })
          .then((response) => {
            if (response.ok) setServerFollowing(next)
            else if (response.status === 401) requestSignIn()
          })
          .catch(() => {})
          .finally(() => setBusy(false))
      }}
    >
      <Bell className="filled" size={16} strokeWidth={1.75} />
      {following ? 'Following' : 'Follow'}
    </button>
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
