import {cookies} from 'next/headers'
import {redirect} from 'next/navigation'
import {PilotApprovalRoom} from './PilotApprovalRoom'
import {
  APP_SESSION_COOKIE,
  currentApplicationUser,
  activePilotMemberEmails,
  pilotMembershipRole,
} from '@/lib/leads/application-auth'
import {pilotRoomPath} from '@/lib/leads/account-paths'
import {pilotTermsFromDraft} from '@/lib/leads/pilot-collaboration'
import {pilotMutableTermsFromState} from '@/lib/leads/pilot-room-revisions'
import {getPilotById} from '@/lib/leads/store'
import {CTAButton} from '@/components/CTAButton'
import {isPortalsTeamReviewerEmail} from '@/lib/leads/pilot-team-reviewer'

function normalizeDates<T>(value: T): T {
  if (value instanceof Date) return value.toISOString() as T
  if (Array.isArray(value)) return value.map(normalizeDates) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, normalizeDates(nested)]),
    ) as T
  }
  return value
}

function StaticPilotRoomBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(180deg, rgba(1, 5, 40, 0.12) 0%, rgba(1, 5, 40, 0.74) 100%), linear-gradient(135deg, #010528 0%, #142E78 38%, #2F66B5 68%, #79C7DA 100%)',
        }}
      />
      <svg className="absolute inset-0 h-full w-full opacity-30 mix-blend-soft-light" aria-hidden="true" preserveAspectRatio="none">
        <defs>
          <filter id="pilot-room-noise">
            <feTurbulence type="fractalNoise" baseFrequency="0.003" numOctaves="3" seed="8" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </defs>
        <rect width="100%" height="100%" filter="url(#pilot-room-noise)" />
      </svg>
    </div>
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
  const storedPilot = await getPilotById(pilotId)
  // The room is a client component. Normalize any Date values in the persisted
  // pilot payload to ISO strings so they can never be rendered as React children.
  const pilot = storedPilot ? normalizeDates(storedPilot) : null
  const roomPath = pilotRoomPath(accountId, pilotId)
  const session = (await cookies()).get(APP_SESSION_COOKIE)?.value
  const user = await currentApplicationUser(session)
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(roomPath)}`)
  const accessRole = pilot?.customerAccountId === accountId
    ? await pilotMembershipRole(pilot.id, user.id)
    : null
  const memberEmails = pilot ? await activePilotMemberEmails(pilot.id) : []
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
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none h-px w-full"
        data-webgl-marker="scrollFrom"
        data-webgl-position="0"
        data-webgl-easing="easeInOut"
      />
      <StaticPilotRoomBackground />
      <section className="relative z-10 mx-auto w-full min-w-0 max-w-3xl px-24">
        {!pilot || !accessRole ? (
          <div className="max-w-[34em] py-24 md:py-40 mx-auto">
            <h1 className="t-h1-sans">this content could not be found.</h1>
            <p className="mt-16 t-p-sans">
              if you expected it to exist, use the secure link in your email or
              sign in with the work email that owns this pilot room.
            </p>
            <div className="mt-24">
              <CTAButton
                href={`/auth/sign-in?next=${encodeURIComponent(roomPath)}`}
                analyticsLabel="pilot room sign in"
              >
                sign in with the pilot owner’s email
              </CTAButton>
            </div>
          </div>
        ) : (
          <PilotApprovalRoom
            pilot={pilot}
            draftTerms={draftTerms}
            accessRole={accessRole}
            userEmail={user.email}
            memberEmails={memberEmails}
            portalsTeamEmails={memberEmails.filter((email) =>
              isPortalsTeamReviewerEmail(email, process.env.LEADS_NOTIFICATION_EMAIL || ''),
            )}
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
    </>
  )
}
