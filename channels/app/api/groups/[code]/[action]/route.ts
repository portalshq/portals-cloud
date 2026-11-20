import { actor, audienceError, audienceJson, audienceRoute, bodyObject, codePattern } from '../../../../../lib/audience'
import { readChat, writeChat } from '../../../../../lib/audience-chat'
import { changeMembership, groupMember, groupSnapshot, tuneGroup } from '../../../../../lib/groups'
import { createHash } from 'node:crypto'

type Context = { params: Promise<{ code: string; action: string }> }

export function GET(request: Request, { params }: Context) {
  return audienceRoute(async () => {
    const { code, action } = await params
    if (!codePattern.test(code)) audienceError(404, 'Group not found.')
    if (action === 'tuning') {
      const tuning = await groupSnapshot(code)
      if (!tuning) audienceError(404, 'Group not found.')
      const etag = `"group-${createHash('sha256').update(JSON.stringify([
        tuning.revision, tuning.slotId, tuning.boundary,
      ])).digest('base64url').slice(0, 20)}"`
      const headers = { ETag: etag, 'Cache-Control': 'public, s-maxage=1' }
      if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers })
      return Response.json(tuning, { headers })
    }
    if (action !== 'membership' && action !== 'chat') audienceError(404, 'Not found.')
    const viewer = await actor(request, action === 'chat')
    const member = viewer && await groupMember(code, viewer.userId)
    if (action === 'membership') return audienceJson({ member: Boolean(member), owner: Boolean(member && member.owner) })
    if (!member) audienceError(403, 'Group membership required.')
    return readChat(request, { kind: 'group', groupId: member.id, userId: viewer.userId })
  })
}

export function POST(request: Request, { params }: Context) {
  return audienceRoute(async () => {
    const { code, action } = await params
    if (!codePattern.test(code)) audienceError(404, 'Group not found.')
    const viewer = await actor(request)
    if (!viewer) audienceError(401, 'Sign in to continue.')
    if (action === 'chat') {
      const member = await groupMember(code, viewer.userId)
      if (!member) audienceError(403, 'Group membership required.')
      return writeChat(request, { kind: 'group', groupId: member.id })
    }
    const body = await bodyObject(request)
    if (action === 'tuning') {
      await tuneGroup(viewer.userId, viewer.displayName, body, code)
      const tuning = await groupSnapshot(code)
      if (!tuning) audienceError(404, 'Group not found.')
      return audienceJson(tuning)
    }
    if (action === 'membership') return audienceJson(await changeMembership(code, viewer.userId, viewer.displayName, body))
    return audienceError(404, 'Not found.')
  })
}
