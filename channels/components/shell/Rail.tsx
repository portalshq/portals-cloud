'use client'

import { ChevronLeft, Compass, Home, Volume2, VolumeX } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import type { RoomAccount } from '@/lib/room-controls'
import { ViewerAccount } from '@/components/auth/ViewerAccount'
import { FollowButton } from '@/components/channels/actions'
import { openFullRoom } from '@/lib/x-card'
import styles from './Rail.module.css'

const links = [
  { href: '/', label: 'Home', Icon: Home, hideIcon: true },
  { href: '/channels', label: 'Browse', Icon: Compass, hideIcon: false },
] as const

type RailProps = {
  roomSlug?: string
  /** The program the room is showing; powers the global follow button. */
  program?: { id?: string; slug: string }
  sound?: { muted: boolean; toggle: () => void; disabled?: boolean }
  account?: RoomAccount | null
  /** X Player Card room: no in-app navigation or account menu. The wordmark
   *  opens the full room, and sign-in requests hand off to it. */
  embed?: boolean
}

export function Rail({ roomSlug, program, sound, account, embed }: RailProps) {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!embed || !roomSlug) return
    const handoff = () => openFullRoom(roomSlug)
    window.addEventListener('channels:open-account', handoff)
    return () => window.removeEventListener('channels:open-account', handoff)
  }, [embed, roomSlug])

  function goBack() {
    const navigation = (window as Window & {
      navigation?: { canGoBack: boolean; back(): { finished: Promise<unknown> } }
    }).navigation
    const feed = `/#channel-${encodeURIComponent(roomSlug ?? '')}`

    // Navigation only exposes contiguous same-origin history entries.
    if (navigation?.canGoBack) {
      void navigation.back().finished.catch(() => router.replace(feed))
    } else {
      router.replace(feed)
    }
  }

  return (
    <nav className={styles.rail} aria-label="Primary">
      <ul className={styles.links}>
        {embed && roomSlug ? (
          <li>
            <a className={styles.link} href={`/${roomSlug}`} target="_blank" rel="noopener">
              <span>channels</span>
            </a>
          </li>
        ) : roomSlug ? (
          <li>
            <button type="button" className={styles.back} aria-label="Back" onClick={goBack}>
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
          </li>
        ) : links.map(({ href, label, hideIcon, Icon }) => {
          // `/` is exact, but every channel room belongs to browse, so the
          // index and its children both keep browse highlighted.
          const exact = pathname === href
          const inSection = href !== '/' && pathname !== '/'
          const current = exact ? 'page' : inSection ? 'true' : undefined

          return (
            <li key={href}>
              <Link className={styles.link} href={href} aria-current={current} data-hide-icon={hideIcon}>
                <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            </li>
          )
        })}
      </ul>

      <div className={styles.foot}>
        {program && (
          <FollowButton className={styles.follow} channel={program.slug} programId={program.id} />
        )}
        {sound && (
          <button type="button" className={styles.sound} aria-label="Stage sound"
            aria-pressed={!sound.muted} disabled={sound.disabled} onClick={sound.toggle}>
            {sound.muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
            <span>{sound.muted ? 'Tap for Sound' : 'Sound On'}</span>
          </button>
        )}
        {!embed && (
          <>
            <ViewerAccount roomAccount={account} />
            <span className={styles.wordmark}>channels</span>
          </>
        )}
      </div>
    </nav>
  )
}
