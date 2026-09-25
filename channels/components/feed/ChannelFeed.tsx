'use client'

import { VideoDeliveryPlayer } from '@portalshq/capability-video-delivery/react'
import { ArrowUpRight, Heart, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FollowButton, ShareButton } from '@/components/channels/actions'
import { channels, type Channel } from '@/components/channels/data'
import { Rail } from '@/components/shell/Rail'
import styles from './ChannelFeed.module.css'

/* Structural type only: PlaybackObservation is not re-exported from /react. */
type Observation = { state: string; attempt: number }

function ChannelVideo({ channel }: { channel: Channel }) {
  const [observation, setObservation] = useState<Observation>({ state: 'loading', attempt: 0 })
  const playback = useMemo(
    () => ({ sessionId: `channel-${channel.slug}`, playbackManifestUrl: channel.stream }),
    [channel.slug, channel.stream],
  )

  const { state, attempt } = observation
  const settled = state === 'playing'
  const message =
    state === 'error'
      ? 'This stream is resting. It will come back on its own.'
      : state === 'reconnecting'
        ? `Reconnecting, attempt ${attempt + 1}`
        : 'Tuning in'

  return (
    <div className={styles.video} data-state={state}>
      <VideoDeliveryPlayer
        playback={playback}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-label={`${channel.title} channel preview`}
        onPlaybackObservation={setObservation}
      />
      {!settled && (
        <p className={styles.videoNote} role="status">
          {message}
        </p>
      )}
    </div>
  )
}

function ChannelPanel({ channel, active }: { channel: Channel; active: boolean }) {
  const headingId = `channel-${channel.slug}`

  return (
    <section className={styles.panel} aria-labelledby={headingId}>
      <div className={styles.stack}>
        {/* Only the panel in view holds a live stream. */}
        <div className={styles.videoFrame}>
          {active ? (
            <ChannelVideo channel={channel} />
          ) : (
            <div className={styles.video} aria-hidden="true" />
          )}
        </div>

        <div className={styles.status}>
          <span className={styles.statusDot} aria-hidden="true" />
          <span>{channel.live ? 'Live now' : channel.viewers}</span>
          <span aria-hidden="true">·</span>
          <span>{channel.category}</span>
        </div>

        <div>
          <h2 className={styles.name} id={headingId}>
            {channel.title}
          </h2>
          <p className={styles.byline}>
            {channel.by}
            <span className={styles.source}>
              <Sparkles size={13} strokeWidth={1.75} aria-hidden="true" />
              {channel.source}
            </span>
          </p>
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
  const [activeIndex, setActiveIndex] = useState(0)
  const [progress, setProgress] = useState(0)

  const measure = useCallback(() => {
    const element = scroller.current
    if (!element) return
    const scrollable = element.scrollHeight - element.clientHeight
    setProgress(scrollable > 0 ? element.scrollTop / scrollable : 0)
    const index = Math.round(element.scrollTop / element.clientHeight)
    setActiveIndex(Math.min(channels.length - 1, Math.max(0, index)))
  }, [])

  useEffect(() => {
    const element = scroller.current
    if (!element) return
    measure()
    element.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      element.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [measure])

  return (
    <>
      <Rail position={{ current: activeIndex + 1, total: channels.length }} />

      <div className={styles.progress} aria-hidden="true">
        <span className={styles.progressFill} style={{ transform: `scaleY(${progress})` }} />
      </div>

      <main className={styles.feed} ref={scroller}>
        {channels.map((channel, index) => (
          <ChannelPanel
            key={channel.slug}
            channel={channel}
            active={index === activeIndex}
          />
        ))}
      </main>
    </>
  )
}
