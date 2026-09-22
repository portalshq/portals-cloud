import {cookies} from 'next/headers'
import {notFound, redirect} from 'next/navigation'
import {
  APP_SESSION_COOKIE,
  currentApplicationUser,
} from '@/lib/leads/application-auth'
import {legacyPilotPath, pilotRoomPathForPilotOrFallback} from '@/lib/leads/account-paths'
import {getPilotById} from '@/lib/leads/store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function LegacyPilotRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{id: string}>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{id}, query] = await Promise.all([params, searchParams])
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) value.forEach((item) => search.append(key, item))
    else if (value !== undefined) search.set(key, value)
  }
  const queryString = search.toString()
  const legacyNext = legacyPilotPath(id, false, queryString ? `?${queryString}` : '')
  const user = await currentApplicationUser(
    (await cookies()).get(APP_SESSION_COOKIE)?.value,
  )
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(legacyNext)}`)
  const pilot = await getPilotById(id)
  if (!pilot) notFound()
  // Use fallback for orphan pilots so legacy redirects never throw
  const target = pilotRoomPathForPilotOrFallback(pilot)
  const destination = queryString ? `${target}?${queryString}` : target
  redirect(destination)
}
