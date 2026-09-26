'use client'

import { ArrowUpRight, Heart } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FollowButton, ShareButton } from '@/components/channels/actions'
import { ChannelMeta } from '@/components/channels/ChannelMeta'
import { ChannelStream } from '@/components/channels/ChannelStream'
import { channels, type Channel } from '@/components/channels/data'
import { useOnScreen } from '@/components/channels/use-on-screen'
import { Rail } from '@/components/shell/Rail'
import styles from './ChannelFeed.module.css'

function ChannelPanel({
  channel,
  live,
  onVisible,
}: {
  channel: Channel
  live: boolean
  onVisible: (slug: string) => void
}) {
  const headingId = `channel-${channel.slug}`
  const [ref, { visible }] = useOnScreen<HTMLElement>()

  useEffect(() => {
    if (visible) onVisible(channel.slug)
  }, [visible, channel.slug, onVisible])

  return (
    <section className={styles.panel} aria-labelledby={headingId} ref={ref}>
      <div className={styles.stack}>
        <div className={styles.videoFrame}>
          {/* Exactly one panel in the feed holds a stream. The inert box holds
              the frame's size before it does, so nothing shifts on mount. */}
          {live ? (
            <div className={styles.video}>
              <ChannelStream
                channel={channel}
                noteClassName={styles.videoNote}
                paused={!visible}
              />
            </div>
          ) : (
            <div className={styles.video} aria-hidden="true" />
          )}
        </div>

        <div>
          <h2 className={styles.name} id={headingId}>
            {channel.title}
          </h2>
          <ChannelMeta channel={channel} />
        </div>

        <p className={styles.description}>{channel.description}</p>

        <div className={styles.actions}>
          <Link className={styles.primary} href={`/${channel.slug}`}>
            Enter channel
            <ArrowUpRight size={16} strokeWidth={1.75} aria-hidden="true" />
          </Link>
          <FollowButton />
          <ShareButton url={`/${channel.slug}`} />
          {!channel.live && (
            <button className={styles.save} type="button" aria-pressed={false}>
              <Heart size={16} strokeWidth={1.75} aria-hidden="true" />
              Save
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

export function ChannelFeed() {
  const scroller = useRef<HTMLElement | null>(null)
  const scrollable = useRef(0)
  const frame = useRef(0)
  const [progress, setProgress] = useState(0)
  const [live, setLive] = useState<string | null>(null)

  /* The feed holds one stream at a time. Which panel that is comes from that
     panel's own visibility, not from scroll arithmetic, so a stream is never
     started for a panel that is not on screen and never dropped for one that
     is. */
  const takeOver = useCallback((slug: string) => {
    setLive(slug)
  }, [])

  /* Only the progress rail reads scroll position now. Which stream is live is
     decided by each panel's own visibility, so this never gates playback. */
  const measure = useCallback(() => {
    const element = scroller.current
    if (!element) return
    setProgress(scrollable.current > 0 ? element.scrollTop / scrollable.current : 0)
  }, [])

  /* Total scroll distance is stable between resizes, so it is cached instead of
     read per event, and scroll events collapse into one frame of work rather
     than one render each. */
  const resize = useCallback(() => {
    const element = scroller.current
    if (!element) return
    scrollable.current = element.scrollHeight - element.clientHeight
    measure()
  }, [measure])

  const onScroll = useCallback(() => {
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      measure()
    })
  }, [measure])

  useEffect(() => {
    const element = scroller.current
    if (!element) return
    resize()
    element.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', resize)
    return () => {
      element.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', resize)
      if (frame.current) cancelAnimationFrame(frame.current)
    }
  }, [onScroll, resize])

  return (
    <>
      <Rail />

      <div className={styles.progress} aria-hidden="true">
        <span className={styles.progressFill} style={{ transform: `scaleY(${progress})` }} />
      </div>

      <main className={styles.feed} ref={scroller}>
        {channels.map((channel) => (
          <ChannelPanel
            key={channel.slug}
            channel={channel}
            live={live === channel.slug}
            onVisible={takeOver}
          />
        ))}
      </main>
    </>
  )
}
