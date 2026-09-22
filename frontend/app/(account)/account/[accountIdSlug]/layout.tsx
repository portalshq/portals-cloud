import {cookies} from 'next/headers'
import {notFound, redirect} from 'next/navigation'
import {AccountSidebar} from '@/components/account/AccountSidebar'
import {
  APP_SESSION_COOKIE,
  currentApplicationUser,
  getCustomerAccountForUser,
  getCustomerAccountsForUser,
} from '@/lib/leads/application-auth'
import {accountPath, pilotRoomPath} from '@/lib/leads/account-paths'
import {getPilotNavigationForCustomerAccount} from '@/lib/leads/store'

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
  const [pilots, allAccounts] = await Promise.all([
    getPilotNavigationForCustomerAccount(account.id),
    getCustomerAccountsForUser(user.id),
  ])
  const otherAccounts = allAccounts.filter((a) => a.id !== account.id)

  return (
    <div className="min-h-[100dvh]">
      <div className="mx-auto grid min-h-[100dvh] max-w-[96rem] lg:grid-cols-[16rem_minmax(0,1fr)]">
        <AccountSidebar
          accountName={account.name}
          accountHref={accountHref}
          pilots={pilots.map((pilot) => ({
            id: pilot.id,
            href: pilotRoomPath(account.id, pilot.id),
            label: pilot.label,
          }))}
          accounts={
            otherAccounts.length > 0
              ? otherAccounts.map((a) => ({
                  id: a.id,
                  href: accountPath(a.id),
                  name: a.name,
                  active: false,
                }))
              : undefined
          }
        />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  )
}
