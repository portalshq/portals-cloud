import {cookies} from 'next/headers'
import {notFound, redirect} from 'next/navigation'
import {
  APP_SESSION_COOKIE,
  currentApplicationUser,
} from '@/lib/leads/application-auth'
import {pilotRoomPathForPilot} from '@/lib/leads/account-paths'
import {getPilotById} from '@/lib/leads/store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function LegacyPilotRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{id: string}>
  searchParams: Promise<{session_id?: string}>
}) {
  const [{id}, query] = await Promise.all([params, searchParams])
  const pilot = await getPilotById(id)
  if (!pilot) notFound()
  const target = pilotRoomPathForPilot(pilot)
  const destination = query.session_id
    ? `${target}?session_id=${encodeURIComponent(query.session_id)}`
    : target
  const user = await currentApplicationUser(
    (await cookies()).get(APP_SESSION_COOKIE)?.value,
  )
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(destination)}`)
  redirect(destination)
}
