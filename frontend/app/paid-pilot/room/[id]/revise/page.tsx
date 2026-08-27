import {cookies} from 'next/headers'
import {redirect} from 'next/navigation'
import {APP_SESSION_COOKIE, currentApplicationUser} from '@/lib/leads/application-auth'

export const dynamic = 'force-dynamic'

export default async function PilotRevisePage({
  params,
}: {
  params: Promise<{id: string}>
}) {
  const {id} = await params
  const user = await currentApplicationUser((await cookies()).get(APP_SESSION_COOKIE)?.value)
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(`/paid-pilot/room/${id}/revise`)}`)
  redirect(`/paid-pilot/room/${id}`)
}
