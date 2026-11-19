'use client'

import { ChevronLeft, Volume2, VolumeX } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import type { RoomAccount, RoomSurface } from '@/lib/room-controls'
import type { ReactNode } from 'react'
import { ViewerAccount } from '@/components/auth/ViewerAccount'
import { FollowButton } from '@/components/channels/actions'
import { openFullRoom } from '@/lib/x-card'
import { signInWithinFrame } from '@/lib/viewer'
import styles from './Rail.module.css'

const links = [
  { href: '/', label: 'Home' },
  { href: '/channels', label: 'Browse' },
] as const

type RailProps = {
  roomSlug?: string
  /** The program the room is showing; powers the global follow button. */
  program?: { id?: string; slug: string }
  /** Opens the program's styled follow dialog when the room provides one. */
  styledFollow?: (() => void) | null
  sound?: { muted: boolean; toggle: () => void; disabled?: boolean }
  account?: RoomAccount | null
  /** X Player Card room: no in-app navigation or account menu. The wordmark
   *  opens the full room, and sign-in requests hand off to it. */
  surface?: RoomSurface
  roomHref?: string
  /** Panel-style control rendered in the bar itself (e.g. the member group
   *  menu); it cannot live in the account dropdown because the menu clips
   *  overflow. */
  groupControl?: ReactNode
  /** Single-action group control rendered inside the account dropdown
   *  (Start group / Join group). */
  menuAction?: ReactNode
}

export function Rail({ roomSlug, program, styledFollow, sound, account, surface, groupControl, menuAction, roomHref }: RailProps) {
  const router = useRouter()
  const pathname = usePathname()
  const embed = surface !== undefined
  const target = roomHref?.slice(1) ?? roomSlug

  useEffect(() => {
    if (surface !== 'embed' || !target) return
    let attempt: AbortController | undefined
    const handoff = () => {
      if (window.top === window.self) return openFullRoom(target)
      if (attempt) return
      const popup = window.open('about:blank', '_blank')
      if (!popup) return openFullRoom(target)
      popup.opener = null
      const controller = new AbortController()
      attempt = controller
      void signInWithinFrame(popup, controller.signal)
        .catch(() => {
          if (controller.signal.aborted) return
          try {
            if (popup.closed) return
            popup.location.replace(new URL(`/${target}`, window.location.origin).href)
          } catch { openFullRoom(target) }
        })
        .finally(() => { attempt = undefined })
    }
    window.addEventListener('channels:open-account', handoff)
    return () => {
      attempt?.abort()
      window.removeEventListener('channels:open-account', handoff)
    }
  }, [surface, target])

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
        {embed && target ? (
          <li>
            <a className={styles.link} href={`/${target}`} target="_blank" rel="noopener">
              <span>channels</span>
            </a>
          </li>
        ) : roomSlug ? (
          <li>
            <button type="button" className={styles.back} aria-label="Back" onClick={goBack}>
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
          </li>
        ) : links.map(({ href, label }) => {
          // `/` is exact, but every channel room belongs to browse, so the
          // index and its children both keep browse highlighted.
          const exact = pathname === href
          const inSection = href !== '/' && pathname !== '/'
          const current = exact ? 'page' : inSection ? 'true' : undefined

          return (
            <li key={href}>
              <Link className={styles.link} href={href} aria-current={current}>
                <span>{label}</span>
              </Link>
            </li>
          )
        })}
      </ul>

      <div className={styles.foot}>
        {groupControl}
        {program && (
          <FollowButton className={styles.follow} channel={program.slug} programId={program.id} styledFollow={styledFollow} />
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
            <ViewerAccount roomAccount={account} menuAction={menuAction} />
            <span className={styles.wordmark}>channels</span>
          </>
        )}
      </div>
    </nav>
  )
}
