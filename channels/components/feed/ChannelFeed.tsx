'use client'

import { ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createRoomSound } from '@/lib/room-controls'
import { FollowButton, ShareButton } from '@/components/channels/actions'
import { ChannelAppRoom } from '@/components/channels/ChannelAppRoom'
import { ChannelHeadingFonts } from '@/components/channels/ChannelHeadingFonts'
import { ChannelMeta } from '@/components/channels/ChannelMeta'
import { AmbientChat } from '@/components/channels/RoomChat'
import { RoomPreviewFallback } from '@/components/channels/ChannelPreview'
import { channelEntryHref, type Channel } from '@/components/channels/data'
import { useOnScreen } from '@/components/channels/use-on-screen'
import { Rail } from '@/components/shell/Rail'
import styles from './ChannelFeed.module.css'

const ignoreAccount = () => {}

function ChannelPanel({
  channel,
  live,
  muted,
  onVisible,
  sound,
  onRoomSound,
}: {
  channel: Channel
  live: boolean
  muted: boolean
  onVisible: (slug: string) => void
  sound: ReturnType<typeof createRoomSound>
  onRoomSound: (slug: string, available: boolean) => void
}) {
  const [ref, { visible }] = useOnScreen<HTMLElement>()
  const active = live && visible
  const panelId = `channel-${channel.slug}`
  const headingId = `${panelId}-title`

  useEffect(() => {
    if (visible) onVisible(channel.slug)
  }, [visible, channel.slug, onVisible])

  const publishRoomSound = useCallback(
    (available: boolean) => onRoomSound(channel.slug, available),
    [onRoomSound, channel.slug],
  )

  const fallback = <RoomPreviewFallback channel={channel} active={active} muted={muted} noteClassName={styles.videoNote} />
  const href = channelEntryHref(channel)

  return (
    <section id={panelId} className={styles.panel} aria-labelledby={headingId} ref={ref}>
      <div className={styles.stack}>
        <div className={styles.videoFrame}>
          <div className={styles.video}>
            {active && channel.app ? (
              <ChannelAppRoom app={channel.app} name={channel.preview?.name ?? channel.title}
                heading={channel.heading} sound={sound} onAccountChange={ignoreAccount}
                onSoundAvailable={publishRoomSound} variant="preview" chatMessages={channel.preview?.chatMessages} fallback={fallback} />
            ) : fallback}
            <AmbientChat limit={channel.preview?.chatMessages ?? 3} active={active} />
            <ChannelMeta channel={channel} className={styles.meta} />
          </div>
        </div>
        <div className={styles.summary}>
          <h2 className={styles.name} id={headingId} style={channel.heading}>{channel.title}</h2>
          {channel.description && <p className={styles.description}>{channel.description}</p>}
        </div>
        <div className={styles.actions}>
          <Link className={styles.primary} href={href}>
            Enter channel
            <ArrowUpRight size={16} strokeWidth={1.75} aria-hidden="true" />
          </Link>
          <FollowButton channel={channel.slug} programId={channel.programId} />
          <ShareButton channel={channel.slug} url={href} />
        </div>
      </div>
    </section>
  )
}

export function ChannelFeed({ channels }: { channels: Channel[] }) {
  const scroller = useRef<HTMLElement | null>(null)
  const scrollable = useRef(0)
  const frame = useRef(0)
  const [progress, setProgress] = useState(0)
  const [live, setLive] = useState<string | null>(null)
  const documentVisible = useSyncExternalStore(subscribeVisibility, isDocumentVisible, () => false)

  /* One shared room-sound instance drives the rail and any mounted program
     room, so the toggle behaves the same whether the active panel is a
     preview player or an off-air room. */
  const [sound] = useState(() => createRoomSound())
  const muted = useSyncExternalStore(sound.subscribe, sound.getMuted, () => true)
  const [roomSound, setRoomSound] = useState<Record<string, boolean>>({})
  const publishRoomSound = useCallback((slug: string, available: boolean) => {
    setRoomSound((prev) => ({ ...prev, [slug]: available }))
  }, [])

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
      <ChannelHeadingFonts channels={channels} />
      <Rail
        sound={{ muted, toggle: sound.toggle, disabled: !live || !documentVisible || (roomSound[live] === false && !channels.some(channel => channel.slug === live && (channel.stream || channel.previewVideo))) }}
      />

      <div className={styles.progress} aria-hidden="true">
        <span className={styles.progressFill} style={{ transform: `scaleY(${progress})` }} />
      </div>

      <main className={styles.feed} ref={scroller}>
        {channels.map((channel) => (
          <ChannelPanel
            key={channel.slug}
            channel={channel}
            live={documentVisible && live === channel.slug}
            muted={muted}
            onVisible={takeOver}
            sound={sound}
            onRoomSound={publishRoomSound}
          />
        ))}
      </main>
    </>
  )
}

function subscribeVisibility(listener: () => void) {
  document.addEventListener('visibilitychange', listener)
  return () => document.removeEventListener('visibilitychange', listener)
}

function isDocumentVisible() {
  return !document.hidden
}
