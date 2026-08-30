import {NextResponse} from 'next/server'
import {
  createPilotInvitationForActor,
  createTeamInvitationForActor,
} from '@/lib/backend-api.server'
import {APP_SESSION_COOKIE, currentApplicationUser} from '@/lib/leads/application-auth'

export const runtime = 'nodejs'

type InvitationRequest = {
  type?: unknown
  email?: unknown
  customerAccountId?: unknown
  pilotId?: unknown
  role?: unknown
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/**
 * Cookie-authenticated Vercel BFF for the legacy account UI. It never touches
 * RDS or Cognito; AWS re-checks the actor's target-specific authorization.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const sessionToken = request.headers.get('cookie')
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${APP_SESSION_COOKIE}=`))
      ?.slice(APP_SESSION_COOKIE.length + 1)
    const actor = await currentApplicationUser(sessionToken)
    if (!actor) return NextResponse.json({error: 'Authentication is required.'}, {status: 401})

    const input = await request.json() as InvitationRequest
    const email = text(input.email)
    const role = text(input.role)
    if (!email || !role) return NextResponse.json({error: 'email and role are required.'}, {status: 400})

    if (input.type === 'team_member') {
      const customerAccountId = text(input.customerAccountId)
      if (!customerAccountId || !['admin', 'member'].includes(role)) {
        return NextResponse.json({error: 'A team invitation requires customerAccountId and an admin or member role.'}, {status: 400})
      }
      return NextResponse.json(await createTeamInvitationForActor(actor.id, {
        email,
        customerAccountId,
        role: role as 'admin' | 'member',
      }), {status: 201})
    }

    if (input.type === 'pilot_room') {
      const pilotId = text(input.pilotId)
      if (!pilotId || !['participant', 'approver', 'signer'].includes(role)) {
        return NextResponse.json({error: 'A pilot invitation requires pilotId and a participant, approver, or signer role.'}, {status: 400})
      }
      return NextResponse.json(await createPilotInvitationForActor(actor.id, {
        email,
        pilotId,
        role: role as 'participant' | 'approver' | 'signer',
      }), {status: 201})
    }

    return NextResponse.json({error: 'type must be team_member or pilot_room.'}, {status: 400})
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invitation request failed.'
    return NextResponse.json({error: message}, {status: 400})
  }
}
