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

export default async function LegacyPilotRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{id: string}>
  searchParams: Promise<{session_id?: string}>
}) {
  const [{id}, query] = await Promise.all([params, searchParams])
  const legacyNext = query.session_id
    ? `/paid-pilot/room/${encodeURIComponent(id)}?session_id=${encodeURIComponent(query.session_id)}`
    : `/paid-pilot/room/${encodeURIComponent(id)}`
  const user = await currentApplicationUser(
    (await cookies()).get(APP_SESSION_COOKIE)?.value,
  )
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(legacyNext)}`)
  const pilot = await getPilotById(id)
  if (!pilot) notFound()
  // Use fallback for orphan pilots so legacy redirects never throw
  const target = pilotRoomPathForPilotOrFallback(pilot)
  const destination = query.session_id
    ? `${target}?session_id=${encodeURIComponent(query.session_id)}`
    : target
  redirect(destination)
}
