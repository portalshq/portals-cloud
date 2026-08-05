import {NextResponse} from 'next/server'
import {verifyRoomToken} from '@/lib/leads/pilot-tokens'
import {getPilotById, updatePilot} from '@/lib/leads/store'

export async function POST(
  request: Request,
  {params}: {params: Promise<{id: string}>},
): Promise<NextResponse> {
  const {id} = await params
  let tokenValue: string | null = null
  try {
    const body = (await request.json()) as {token?: string}
    tokenValue = body.token || null
  } catch {
    return NextResponse.json({ok: false, message: 'invalid request body'}, {status: 400})
  }
  const token = tokenValue ? verifyRoomToken(tokenValue) : null
  if (!token || token.pilotId !== id) {
    return NextResponse.json({ok: false, message: 'invalid or expired room link'}, {status: 401})
  }

  const pilot = await getPilotById(id)
  if (!pilot) {
    return NextResponse.json({ok: false, message: 'pilot record not found'}, {status: 404})
  }

  const reviewer = pilot.reviewers.find(
    (candidate) =>
      candidate.email.toLowerCase() === token.email.toLowerCase() &&
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
