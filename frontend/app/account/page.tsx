import {cookies} from 'next/headers'
import {redirect} from 'next/navigation'
import {
  APP_SESSION_COOKIE,
  currentApplicationUser,
  getCustomerAccountsForUser,
} from '@/lib/leads/application-auth'
import {accountPath} from '@/lib/leads/account-paths'

export const dynamic = 'force-dynamic'

export default async function AccountPage() {
  const session = (await cookies()).get(APP_SESSION_COOKIE)?.value
  const user = await currentApplicationUser(session)
  if (!user) redirect('/auth/sign-in?next=/account')
  const accounts = await getCustomerAccountsForUser(user.id)
  const account = accounts[0] // First account is highest-privilege due to ORDER BY
  if (account) redirect(accountPath(account.id))

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-24 py-40">
      <h1 className="mt-8 t-h3-sans">
        You’re signed in <span className="t-p-sm-sans">{user.email}</span>
      </h1>
      <p className="mt-12 t-p-sm-sans">
        Use an invitation link or the menu to access a pilot room.
      </p>
    </main>
  )
}
