import {cookies} from 'next/headers'
import {redirect} from 'next/navigation'
import {APP_SESSION_COOKIE, currentApplicationUser} from '@/lib/leads/application-auth'

export const dynamic = 'force-dynamic'

export default async function AccountPage() {
  const session = (await cookies()).get(APP_SESSION_COOKIE)?.value
  const user = await currentApplicationUser(session)
  if (!user) redirect('/auth/sign-in?next=/account')

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-24 py-40">
      <p className="t-p-sm-sans text-[#52617D]">portals account</p>
      <h1 className="mt-8 t-h3-sans">You’re signed in</h1>
      <p className="mt-12 t-p-sm-sans text-[#52617D]">
        {user.email} has an application account. Use an invitation link to open a specific pilot room.
      </p>
    </main>
  )
}
