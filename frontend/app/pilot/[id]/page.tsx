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
      <section className="mx-auto my-auto w-full max-w-4xl px-24 py-24 md:py-40">
        {!pilot ? (
          <div className="max-w-[34em]">
            <h1 className="t-h1-sans">this pilot room could not be found.</h1>
            <p className="mt-16 t-p-lg-sans">
              the record may have been removed. if you expected it to exist,
              reply to the email that brought you here.
            </p>
          </div>
        ) : !access ? (
          <div className="max-w-[34em]">
            <h1 className="t-h1-sans">this link needs verification.</h1>
            <p className="mt-16 t-p-lg-serif">
              open the link from your pilot email to continue. each room link is
              tied to a single recipient.
            </p>
          </div>
        ) : (
          <PilotApprovalRoom
            pilot={pilot}
            token={access.token}
            accessToken={access.accessToken}
            sessionId={query.session_id}
            revisePath={`/pilot/${id}/revise?t=${encodeURIComponent(access.accessToken)}`}
          />
        )}
      </section>
    </main>
  )
}
