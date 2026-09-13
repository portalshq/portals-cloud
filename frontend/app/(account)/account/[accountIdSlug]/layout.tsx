import {cookies} from 'next/headers'
import {notFound, redirect} from 'next/navigation'
import {AccountSidebar} from '@/components/account/AccountSidebar'
import {
  APP_SESSION_COOKIE,
  currentApplicationUser,
  getCustomerAccountForUser,
} from '@/lib/leads/application-auth'
import {accountPath, pilotRoomPath} from '@/lib/leads/account-paths'
import {getPilotsForCustomerAccount} from '@/lib/leads/store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function AccountLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{accountIdSlug: string}>
}) {
  const {accountIdSlug} = await params
  const session = (await cookies()).get(APP_SESSION_COOKIE)?.value
  const user = await currentApplicationUser(session)
  const requestedAccountHref = accountPath(accountIdSlug)
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(requestedAccountHref)}`)
  const account = await getCustomerAccountForUser(accountIdSlug, user.id)
  if (!account) notFound()
  const accountHref = accountPath(account.id)
  const pilots = await getPilotsForCustomerAccount(account.id)

  return (
    <div className="min-h-[100dvh]">
      <div className="mx-auto grid min-h-[100dvh] max-w-[96rem] lg:grid-cols-[16rem_minmax(0,1fr)]">
        <AccountSidebar
          accountName={account.name}
          accountHref={accountHref}
          pilots={pilots.map((pilot) => ({
            id: pilot.id,
            href: pilotRoomPath(account.id, pilot.id),
          }))}
        />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  )
}
