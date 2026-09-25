'use client'

import { Bell, Share } from 'lucide-react'
import { useState } from 'react'
import styles from './actions.module.css'

/** Following turns the icon chip, not the label. The word stays in normal ink
 *  outside the green, and the button keeps a fixed width so swapping
 *  "Follow" for "Following" cannot reflow the row. */
export function FollowButton() {
  const [following, setFollowing] = useState(false)

  return (
    <button
      className={`${styles.button} ${styles.follow}`}
      type="button"
      aria-pressed={following}
      onClick={() => setFollowing((value) => !value)}
    >
      {/* The bell is the channel in both states. The chip and the word carry
          the change; swapping the glyph too would be a second signal saying
          the same thing. */}
      <span className={styles.chip} aria-hidden="true">
        <Bell size={16} strokeWidth={1.75} />
      </span>
      {following ? 'Following' : 'Follow'}
    </button>
  )
}

/** Fixed for the same reason: "Share" becomes "Link copied". */
export function ShareButton({ url }: { url: string }) {
  const [shared, setShared] = useState(false)

  return (
    <button
      className={`${styles.button} ${styles.share}`}
      type="button"
      onClick={() => {
        // The clipboard rejects in a non-secure context and can be denied by
        // the browser, so only claim success once the write actually lands.
        // `void` on a rejected promise would surface as an unhandled rejection.
        navigator.clipboard
          ?.writeText(new URL(url, window.location.origin).href)
          .then(() => setShared(true))
          .catch(() => setShared(false))
      }}
    >
      <Share size={16} strokeWidth={1.75} aria-hidden="true" />
      {shared ? 'Link copied' : 'Share'}
    </button>
  )
}
