import type {Metadata} from 'next'
import {PilotApprovalRoom} from '@/components/leads/PilotApprovalRoom'
import {resolveRoomAccess} from '@/lib/leads/room-access'
import {getPilotById} from '@/lib/leads/store'

export const metadata: Metadata = {
  title: 'Pilot Approval Room',
  description: 'Review, confirm, and sign your personalized production pilot plan.',
}

export const dynamic = 'force-dynamic'

export default async function PilotRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{id: string}>
  searchParams: Promise<{t?: string; session_id?: string}>
}) {
  const [{id}, query] = await Promise.all([params, searchParams])
  const pilot = await getPilotById(id)
  const access = await resolveRoomAccess(pilot, query.t)

  return (
    <main className="relative z-(--z-main) min-h-screen bg-white lowercase text-[#07112C]">
      <section className="w-full max-w-5xl mx-auto px-24 py-24 md:py-40">
        {!pilot ? (
          <div className="max-w-[34em] mx-auto">
            <h1 className="t-h1-sans">this content could not be found.</h1>
            <p className="mt-16 t-p-sans">
              if you expected it to exist,
              reply to the email that brought you here.
            </p>
          </div>
        ) : !access ? (
          <div className="max-w-[34em] mx-auto">
            <h1 className="t-h1-sans">this content could not be found.</h1>
            <p className="mt-16 t-p-sans">
              if you expected it to exist,
              reply to the email that brought you here.
            </p>
          </div>
        ) : (
          <PilotApprovalRoom
            pilot={pilot}
            token={access.token}
            accessToken={access.accessToken}
            sessionId={query.session_id}
            revisePath={`/paid-pilot/room/${id}/revise?t=${encodeURIComponent(access.accessToken)}`}
          />
        )}
      </section>
    </main>
  )
}
