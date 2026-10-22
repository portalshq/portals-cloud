'use client'

import Link from 'next/link'
import {usePathname} from 'next/navigation'
import {Menu} from 'lucide-react'
import {Sheet, SheetContent, SheetTrigger} from '@/components/ui/sheet'
import {useIsMobile} from '@/hooks/use-mobile'
import {useState} from 'react'

type AccountPilotLink = {
  id: string
  href: string
  label?: string
}

type AccountLink = {
  id: string
  href: string
  name: string
  active: boolean
}

export function AccountSidebar({
  accountName,
  accountHref,
  pilots,
  accounts,
}: {
  accountName: string
  accountHref: string
  pilots: AccountPilotLink[]
  accounts?: AccountLink[]
}) {
  const pathname = usePathname()
  const isMobile = useIsMobile()
  const [isOpen, setIsOpen] = useState(false)

  const sidebarContent = (isMobileView: boolean) => (
    <>
      <p className="mt-8 break-words t-p-sm-sans">{accountName}</p>
      {accounts && accounts.length > 1 ? (
        <nav className="mt-24 flex flex-row lg:flex-col gap-8" aria-label="Accounts">
          {accounts.map((account) => (
            <Link
              key={account.id}
              href={account.href}
              onClick={isMobileView ? () => setIsOpen(false) : undefined}
              aria-current={account.active ? 'page' : undefined}
              className={`block rounded shrink-0 border px-12 py-8 t-p-sm-sans transition-colors ${
                account.active
                  ? 'border-white bg-white text-[#07112C]'
                  : 'border-white/30 text-white hover:border-white'
              }`}
            >
              {account.name}
            </Link>
          ))}
        </nav>
      ) : null}
      <nav className="mt-32 flex flex-col gap-8 lg:block lg:space-y-8" aria-label="Account">
        <Link
          href={accountHref}
          onClick={isMobileView ? () => setIsOpen(false) : undefined}
          aria-current={pathname === accountHref ? 'page' : undefined}
          className={`block rounded shrink-0 border px-16 py-12 t-p-sm-sans transition-colors ${
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
              onClick={isMobileView ? () => setIsOpen(false) : undefined}
              aria-current={active ? 'page' : undefined}
              className={`block rounded shrink-0 border px-16 py-12 t-p-sm-sans transition-colors ${
                active
                  ? 'border-white bg-white text-[#07112C]'
                  : 'border-white/30 text-white hover:border-white'
              }`}
            >
              {pilot.label || 'Pilot room'}
            </Link>
          )
        })}
      </nav>
    </>
  )

  return (
    <>
      <div className="fixed right-16 top-16 z-[150] lg:hidden">
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <button
              className="flex h-48 w-48 items-center justify-center rounded-sm border border-white/30 bg-white/8 text-white transition-colors hover:border-white hover:bg-white/16"
              aria-label="Open menu"
            >
              <Menu className="h-24 w-24" />
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="!z-[200] w-[80vw] max-w-sm border-l border-white/20 bg-[#07112C] p-24 text-white !bg-[#07112C] [&>button]:!opacity-100 [&>button]:!h-40 [&>button]:!w-40 [&>button]:!p-8 [&>button]:!flex [&>button]:!items-center [&>button]:!justify-center [&>button>svg]:!h-24 [&>button>svg]:!w-24 [&>button]:!text-white [&>button]:hover:!bg-white/10" style={{zIndex: 200}}>
            {sidebarContent(true)}
          </SheetContent>
        </Sheet>
      </div>
      <style>{`
        [data-radix-sheet-content] {
          z-index: 200 !important;
        }
        [data-radix-sheet-overlay] {
          z-index: 200 !important;
        }
      `}</style>
      <aside className="hidden relative fixed z-[100] min-w-0 border-b border-white/20 bg-[#07112C] px-24 py-24 text-white lg:min-h-[100dvh] lg:border-b-0 lg:border-r lg:px-20 lg:py-32 lg:block">
        {sidebarContent(false)}
      </aside>
    </>
  )
}
