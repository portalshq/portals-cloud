'use client'

import { Compass, Home } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { ViewerAccount } from '@/components/auth/ViewerAccount'
import styles from './Rail.module.css'

const links = [
  { href: '/', label: 'home', Icon: Home, hideIcon: true },
  { href: '/channels', label: 'browse', Icon: Compass, hideIcon: false },
] as const

type RailProps = {
  /** Page-specific links rendered under the primary navigation. */
  children?: ReactNode
}

/**
 * The left drawer. A fixed 264px rail that wipes open to a 76px strip via
 * clip-path, so the reveal never animates a layout property. Labels live in
 * the clipped region at opacity 0 and fade in on open.
 */
export function Rail({ children }: RailProps) {
  const pathname = usePathname()

  return (
    <nav className={styles.rail} aria-label="Primary">
      <ul className={styles.links}>
        {links.map(({ href, label, hideIcon, Icon }) => {
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

      {children}

      <div className={styles.foot}>
        <ViewerAccount />
        <span className={styles.wordmark}>channels</span>
      </div>
    </nav>
  )
}
