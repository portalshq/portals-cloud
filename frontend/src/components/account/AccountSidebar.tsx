'use client'

import Link from 'next/link'
import {usePathname} from 'next/navigation'

type AccountPilotLink = {
  id: string
  href: string
}

export function AccountSidebar({
  accountName,
  accountHref,
  pilots,
}: {
  accountName: string
  accountHref: string
  pilots: AccountPilotLink[]
}) {
  const pathname = usePathname()

  return (
    <aside className="relative z-20 border-b border-white/20 bg-[#07112C] px-24 py-24 text-white lg:min-h-[100dvh] lg:border-b-0 lg:border-r lg:px-20 lg:py-32">
      <p className="t-p-sm-sans text-white/60">portals account</p>
      <p className="mt-8 break-words t-p-sm-sans">{accountName}</p>
      <nav className="mt-32 flex gap-8 overflow-x-auto lg:block lg:space-y-8" aria-label="Account">
        <Link
          href={accountHref}
          aria-current={pathname === accountHref ? 'page' : undefined}
          className={`block shrink-0 border px-16 py-12 t-p-sm-sans transition-colors ${
            pathname === accountHref
              ? 'border-white bg-white text-[#07112C]'
              : 'border-white/30 text-white hover:border-white'
          }`}
        >
          Account
        </Link>
        {pilots.map((pilot) => {
          const active = pathname === pilot.href || pathname.startsWith(`${pilot.href}/`)
          return (
            <Link
              key={pilot.id}
              href={pilot.href}
              aria-current={active ? 'page' : undefined}
              className={`block shrink-0 border px-16 py-12 t-p-sm-sans transition-colors ${
                active
                  ? 'border-white bg-white text-[#07112C]'
                  : 'border-white/30 text-white hover:border-white'
              }`}
            >
              Pilot room
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
