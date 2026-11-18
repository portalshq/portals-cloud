import { actor, audienceError, audienceJson, audienceRoute, bodyObject } from '../../../lib/audience'
import { tuneGroup } from '../../../lib/groups'

export function POST(request: Request) {
  return audienceRoute(async () => {
    const viewer = await actor(request)
    if (!viewer) audienceError(401, 'Sign in to continue.')
    return audienceJson(await tuneGroup(viewer.userId, viewer.displayName, await bodyObject(request)), 201)
  })
}
