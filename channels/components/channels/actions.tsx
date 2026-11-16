'use client'

import { Bell, Forward } from 'lucide-react'
import { useState } from 'react'
import { channelEvents } from '@/lib/analytics-contract'
import { recordChannelEvent } from '@/lib/analytics-client'
import styles from './actions.module.css'

/** Following turns the icon chip, not the label. The word stays in normal ink
 *  outside the accent, and the button keeps a fixed width so swapping
 *  "Follow" for "Following" cannot reflow the row. */
export function FollowButton({ channel }: { channel: string }) {
  const [following, setFollowing] = useState(false)

  return (
    <button
      className={`${styles.button} ${styles.follow}`}
      type="button"
      aria-pressed={following}
      onClick={() => {
        const next = !following
        setFollowing(next)
        recordChannelEvent(channelEvents.follow, {channel, following: next})
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
