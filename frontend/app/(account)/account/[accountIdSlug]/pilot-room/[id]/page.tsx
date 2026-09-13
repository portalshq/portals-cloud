import type {Metadata} from 'next'
import {PilotRoomRoute} from '@/components/leads/PilotRoomRoute'

export const metadata: Metadata = {
  title: 'Pilot Approval Room',
  description: 'Review, confirm, and sign your personalized production pilot plan.',
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function NestedPilotRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{accountIdSlug: string; id: string}>
  searchParams: Promise<{session_id?: string}>
}) {
  const [{accountIdSlug, id}, query] = await Promise.all([params, searchParams])
  return (
    <PilotRoomRoute
      accountId={accountIdSlug}
      pilotId={id}
      sessionId={query.session_id}
    />
  )
}
