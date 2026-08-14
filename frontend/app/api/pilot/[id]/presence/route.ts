import {NextResponse} from 'next/server'
import {cookies} from 'next/headers'
import {APP_SESSION_COOKIE, currentApplicationUser, pilotMembershipRole} from '@/lib/leads/application-auth'
import {getPilotById, updatePilot} from '@/lib/leads/store'

export async function POST(
  request: Request,
  {params}: {params: Promise<{id: string}>},
): Promise<NextResponse> {
  const {id} = await params
  const pilot = await getPilotById(id)
  if (!pilot) {
    return NextResponse.json({ok: false, message: 'pilot record not found'}, {status: 404})
  }
  const user = await currentApplicationUser((await cookies()).get(APP_SESSION_COOKIE)?.value)
  if (!user || !(await pilotMembershipRole(pilot.id, user.id))) {
    return NextResponse.json({ok: false, message: 'sign in is required'}, {status: 401})
  }

  const reviewer = pilot.reviewers.find(
    (candidate) =>
      candidate.email.toLowerCase() === user.email.toLowerCase() &&
      candidate.status !== 'revoked',
  )
  if (!reviewer) {
    return NextResponse.json({ok: true})
  }
  if (reviewer.status === 'proposed' || reviewer.status === 'invited') {
    const now = new Date().toISOString()
    await updatePilot(id, {
      reviewers: pilot.reviewers.map((candidate) =>
        candidate.id === reviewer.id
          ? {
              ...candidate,
              status: 'opened',
              openedAt: candidate.openedAt || now,
              versionSeen: Math.max(candidate.versionSeen, pilot.version),
            }
          : candidate,
      ),
      historyNote: `${reviewer.email} opened the room`,
    })
  }
  return NextResponse.json({ok: true})
}
