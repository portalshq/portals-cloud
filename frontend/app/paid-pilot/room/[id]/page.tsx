import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { PilotApprovalRoom } from '@/components/leads/PilotApprovalRoom'
import { APP_SESSION_COOKIE, currentApplicationUser, pilotMembershipRole } from '@/lib/leads/application-auth'
import { pilotTermsFromDraft } from '@/lib/leads/pilot-collaboration'
import { pilotMutableTermsFromState } from '@/lib/leads/pilot-room-revisions'
import { getPilotById } from '@/lib/leads/store'

export const metadata: Metadata = {
  title: 'Pilot Approval Room',
  description: 'Review, confirm, and sign your personalized production pilot plan.',
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function StaticPilotRoomBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0"
      style={{
        backgroundImage:
          'linear-gradient(180deg, rgba(1, 5, 40, 0.12) 0%, rgba(1, 5, 40, 0.74) 100%), linear-gradient(135deg, #010528 0%, #142E78 38%, #2F66B5 68%, #79C7DA 100%)',
      }}
    />
  )
}
export default async function PilotRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ session_id?: string }>
}) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const pilot = await getPilotById(id)
  const session = (await cookies()).get(APP_SESSION_COOKIE)?.value
  const user = await currentApplicationUser(session)
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(`/paid-pilot/room/${id}`)}`)
  const accessRole = pilot ? await pilotMembershipRole(pilot.id, user.id) : null
  const draftTerms = pilot
    ? pilotTermsFromDraft(pilot.draft, pilotMutableTermsFromState(pilot))
    : undefined

  return (
    <main className="relative z-(--z-main) min-h-screen overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none h-px w-full"
        data-webgl-marker="scrollFrom"
        data-webgl-position="0"
        data-webgl-easing="easeInOut"
      />
      <StaticPilotRoomBackground />
      <section className="relative z-10 w-full max-w-5xl mx-auto px-24 py-24 md:py-40">
        {!pilot ? (
          <div className="max-w-[34em] mx-auto">
            <h1 className="t-h1-sans">this content could not be found.</h1>
            <p className="mt-16 t-p-sans">
              if you expected it to exist,
              reply to the email that brought you here.
            </p>
          </div>
        ) : !accessRole ? (
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
            draftTerms={draftTerms}
            accessRole={accessRole}
            userEmail={user.email}
            sessionId={query.session_id}
            revisePath={`/paid-pilot/room/${id}/revise`}
            founderAccess={
              Boolean(process.env.LEADS_NOTIFICATION_EMAIL) &&
              user.email.toLowerCase() ===
              String(process.env.LEADS_NOTIFICATION_EMAIL).trim().toLowerCase()
            }
            qualificationCalendarUrl={process.env.PILOT_CALENDAR_URL}
          />
        )}
      </section>
    </main>
  )
}
