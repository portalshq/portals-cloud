import {cookies} from 'next/headers'
import {notFound, redirect} from 'next/navigation'
import {
  APP_SESSION_COOKIE,
  currentApplicationUser,
} from '@/lib/leads/application-auth'
import {pilotRoomPathForPilotOrFallback} from '@/lib/leads/account-paths'
import {getPilotById} from '@/lib/leads/store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function LegacyPilotRevisePage({
  params,
}: {
  params: Promise<{id: string}>
}) {
  const {id} = await params
  const legacyNext = `/paid-pilot/room/${encodeURIComponent(id)}/revise`
  const user = await currentApplicationUser(
    (await cookies()).get(APP_SESSION_COOKIE)?.value,
  )
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(legacyNext)}`)
  const pilot = await getPilotById(id)
  if (!pilot) notFound()
  const destination = pilotRoomPathForPilotOrFallback(pilot)
  redirect(destination)
}
