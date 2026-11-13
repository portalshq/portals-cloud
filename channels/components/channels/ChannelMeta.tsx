'use client'

import { Sparkles } from 'lucide-react'
import type { Channel } from './data'
import styles from './ChannelMeta.module.css'

/** One line of channel identity: who runs it, what powers it, and where it is
 *  right now. The feed and the channel room render the same line, so it lives
 *  here rather than being assembled twice. */
export function ChannelMeta({ channel, className }: { channel: Channel; className?: string }) {
  const status = channel.live ? 'Live now' : channel.nextSession
    ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })
      .format(new Date(channel.nextSession)) + ' UTC'
    : channel.viewers
  return (
    <p className={className ? `${styles.meta} ${className}` : styles.meta}>
      <span>{channel.by}</span>
      <span className={styles.source}>
        <Sparkles className="filled" size={13} strokeWidth={1.75} aria-hidden="true" />
        {channel.source}
      </span>
      {status && (
        <>
          <span className={styles.blurb}>{status}</span>
        </>
      )}
    </p>
  )
}
