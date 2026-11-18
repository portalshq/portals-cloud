'use client'

import { ArrowUpRight, Heart } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createRoomSound, type RoomAccount } from '@/lib/room-controls'
import { FollowButton, ShareButton } from '@/components/channels/actions'
import { ChannelAppRoom } from '@/components/channels/ChannelAppRoom'
import { ChannelHeadingFonts } from '@/components/channels/ChannelHeadingFonts'
import { ChannelMeta } from '@/components/channels/ChannelMeta'
import { ChannelPreview, useChannelPreview } from '@/components/channels/ChannelPreview'
import { channelOffAir, formatSessionTime, type Channel } from '@/components/channels/data'
import { useOnScreen } from '@/components/channels/use-on-screen'
import { Rail } from '@/components/shell/Rail'
import styles from './ChannelFeed.module.css'

/* The program's off-air card, recreated for the feed: a label, the next
   start in the words the room uses ("Today 8:00 PM"), and the follow action
   whose click opens the reminder form. With no session on the schedule the
   card still answers when — "No upcoming session scheduled". */
function NextSessionCard({ channel }: { channel: Channel }) {
  return (
    <div className={styles.sessionCard}>
      <span className={styles.sessionLabel}>Next session</span>
      <span className={styles.sessionDate}>
        {channel.nextSession
          ? <time dateTime={channel.nextSession}>{formatSessionTime(channel.nextSession)}</time>
          : 'No upcoming session scheduled'}
      </span>
      <FollowButton channel={channel.slug} programId={channel.programId} className={styles.roomFollow} />
    </div>
  )
}

function ChannelPanel({
  channel: initialChannel,
  live,
  muted,
  onVisible,
  sound,
  onRoomAccount,
  onRoomSound,
}: {
  channel: Channel
  live: boolean
  muted: boolean
  onVisible: (slug: string) => void
  sound: ReturnType<typeof createRoomSound>
  onRoomAccount: (slug: string, account: RoomAccount | null) => void
  onRoomSound: (slug: string, available: boolean) => void
}) {
  const [ref, { visible }] = useOnScreen<HTMLElement>()
  const active = live && visible
  const channel = useChannelPreview(initialChannel, active)
  const panelId = `channel-${channel.slug}`
  const headingId = `${panelId}-title`

  useEffect(() => {
    if (visible) onVisible(channel.slug)
  }, [visible, channel.slug, onVisible])

  /* The program room mounts lazily on first view — a feed of rooms would
     otherwise open every app's connections on page load. Once seen it stays
     mounted, so scrolling back lands on the room as it was left. The room
     control callbacks are stabilised because the app mounts (and unmounts)
     on any change to them. */
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    if (visible) setSeen(true)
  }, [visible])
  const publishRoomAccount = useCallback(
    (account: RoomAccount | null) => onRoomAccount(channel.slug, account),
    [onRoomAccount, channel.slug],
  )
  const publishRoomSound = useCallback(
    (available: boolean) => onRoomSound(channel.slug, available),
    [onRoomSound, channel.slug],
  )

  /* Off-air panels drop the preview. An off-air program renders its own room
     inside the panel — the same mount the room route gives it — while a
     channel without a program shows the room card instead. The panel still
     owns the playback slot while visible, so the same preview poll that
     found the off-air state flips the panel back to the player the moment a
     session starts. */
  const offAir = channelOffAir(channel)
  const name = channel.preview?.name ?? channel.title
  const appRoom = offAir && channel.app ? channel.app : null

  return (
    <section id={panelId} className={styles.panel}
      aria-labelledby={appRoom ? undefined : headingId}
      aria-label={appRoom ? channel.title : undefined}
      ref={ref}>
      <div className={styles.stack}>
        {appRoom ? (
          <div className={styles.roomFrame}>
            {seen && (
              <ChannelAppRoom app={appRoom} name={name} heading={channel.heading}
                sound={sound} onAccountChange={publishRoomAccount} onSoundAvailable={publishRoomSound} />
            )}
          </div>
        ) : offAir ? (
          <div className={styles.roomContent}>
            <h2 className={styles.name} id={headingId} style={channel.heading}>
              {channel.title}
            </h2>
            <p className={styles.roomStatus}>{name} is off air. Check back soon.</p>
            <NextSessionCard channel={channel} />
          </div>
        ) : (
          <>
            <div className={styles.videoFrame}>
              <div className={styles.video}>
                <ChannelPreview
                  channel={channel}
                  active={active}
                  playVideo={live}
                  muted={muted}
                  noteClassName={styles.videoNote}
                />
                <ChannelMeta channel={channel} className={styles.meta} />
              </div>
            </div>

            <div className={styles.summary}>
              <h2 className={styles.name} id={headingId} style={channel.heading}>
                {channel.title}
              </h2>
              {channel.description && <p className={styles.description}>{channel.description}</p>}
            </div>

            <div className={styles.actions}>
              <Link className={styles.primary} href={`/${channel.slug}`}>
                Enter channel
                <ArrowUpRight size={16} strokeWidth={1.75} aria-hidden="true" />
              </Link>
              <FollowButton channel={channel.slug} programId={channel.programId} />
              <ShareButton channel={channel.slug} url={`/${channel.slug}`} />
            </div>
          </>
        )}
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

  /* One shared room-sound instance drives the rail and any mounted program
     room, so the toggle behaves the same whether the active panel is a
     preview player or an off-air room. */
  const [sound] = useState(createRoomSound)
  const muted = useSyncExternalStore(sound.subscribe, sound.getMuted, () => true)
  /* Program rooms publish their account and sound support per slug; the rail
     reads whichever panel currently owns the slot. */
  const [roomAccounts, setRoomAccounts] = useState<Record<string, RoomAccount | null>>({})
  const [roomSound, setRoomSound] = useState<Record<string, boolean>>({})
  const publishRoomAccount = useCallback((slug: string, account: RoomAccount | null) => {
    setRoomAccounts((prev) => ({ ...prev, [slug]: account }))
  }, [])
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
        sound={{ muted, toggle: sound.toggle, disabled: live !== null && roomSound[live] === false }}
        account={live ? roomAccounts[live] ?? null : null}
      />

      <div className={styles.progress} aria-hidden="true">
        <span className={styles.progressFill} style={{ transform: `scaleY(${progress})` }} />
      </div>

      <main className={styles.feed} ref={scroller}>
        {channels.map((channel) => (
          <ChannelPanel
            key={channel.slug}
            channel={channel}
            live={live === channel.slug}
            muted={muted}
            onVisible={takeOver}
            sound={sound}
            onRoomAccount={publishRoomAccount}
            onRoomSound={publishRoomSound}
          />
        ))}
      </main>
    </>
  )
}
