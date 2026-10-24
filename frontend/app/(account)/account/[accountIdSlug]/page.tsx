import {cookies} from 'next/headers'
import {notFound, redirect} from 'next/navigation'
import {
  APP_SESSION_COOKIE,
  currentApplicationUser,
  getCustomerAccountForUser,
} from '@/lib/leads/application-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function AccountPage({
  params,
}: {
  params: Promise<{accountIdSlug: string}>
}) {
  // Account landing pages still require account-wide membership. Pilot-room
  // routes perform their separate, room-scoped authorization in PilotRoomRoute.
  const {accountIdSlug} = await params
  const session = (await cookies()).get(APP_SESSION_COOKIE)?.value
  const user = await currentApplicationUser(session)
  if (!user) redirect('/auth/sign-in?next=/account')
  const account = await getCustomerAccountForUser(accountIdSlug, user.id)
  if (!account) notFound()

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
