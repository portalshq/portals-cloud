import { readChat, writeChat } from '../../../lib/audience-chat'
import { audienceError, audienceRoute } from '../../../lib/audience'

function legacyProgram(request: Request) {
  const programId = new URL(request.url).searchParams.get('programId')?.trim()
  if (!programId || programId.length > 256) audienceError(400, 'programId is required.')
  return programId
}

/** Compatibility route for clients that cannot yet use /api/programs/:id/chat. */
export function GET(request: Request) {
  return audienceRoute(async () => readChat(request, { kind: 'program', programId: legacyProgram(request) }))
}
export function POST(request: Request) {
  return audienceRoute(async () => writeChat(request, { kind: 'program', programId: legacyProgram(request) }))
}
