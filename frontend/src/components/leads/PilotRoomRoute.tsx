import {cookies} from 'next/headers'
import {redirect} from 'next/navigation'
import {PilotApprovalRoom} from './PilotApprovalRoom'
import {
  APP_SESSION_COOKIE,
  currentApplicationUser,
  pilotMembershipRole,
} from '@/lib/leads/application-auth'
import {pilotRoomPath} from '@/lib/leads/account-paths'
import {pilotTermsFromDraft} from '@/lib/leads/pilot-collaboration'
import {pilotMutableTermsFromState} from '@/lib/leads/pilot-room-revisions'
import {getPilotById} from '@/lib/leads/store'

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

export async function PilotRoomRoute({
  accountId,
  pilotId,
  sessionId,
}: {
  accountId: string
  pilotId: string
  sessionId?: string
}) {
  const pilot = await getPilotById(pilotId)
  const roomPath = pilotRoomPath(accountId, pilotId)
  const session = (await cookies()).get(APP_SESSION_COOKIE)?.value
  const user = await currentApplicationUser(session)
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(roomPath)}`)
  const accessRole = pilot?.customerAccountId === accountId
    ? await pilotMembershipRole(pilot.id, user.id)
    : null
  const draftTerms = pilot
    ? pilotTermsFromDraft(pilot.draft, pilotMutableTermsFromState(pilot))
    : undefined
  const configuredKickoffDates = String(process.env.PILOT_KICKOFF_DATES || '').split(',').map((date) => date.trim()).filter(Boolean)
  const kickoffAvailability = configuredKickoffDates.map((date) => ({
    date,
    label: date,
    timezone: process.env.PILOT_KICKOFF_TIMEZONE || 'America/New_York',
    version: 'env-v1',
  }))

  return (
    <main className="relative z-(--z-main) min-h-screen">
      <div
        aria-hidden="true"
        className="pointer-events-none h-px w-full"
        data-webgl-marker="scrollFrom"
        data-webgl-position="0"
        data-webgl-easing="easeInOut"
      />
      <StaticPilotRoomBackground />
      <section className="relative z-10 w-full max-w-3xl mx-auto px-24 py-24 md:py-40">
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
            sessionId={sessionId}
            revisePath={roomPath}
            founderAccess={
              Boolean(process.env.LEADS_NOTIFICATION_EMAIL) &&
              user.email.toLowerCase() ===
              String(process.env.LEADS_NOTIFICATION_EMAIL).trim().toLowerCase()
            }
            qualificationCalendarUrl={process.env.PILOT_CALENDAR_URL}
            kickoffAvailability={kickoffAvailability}
          />
        )}
      </section>
    </main>
  )
}
