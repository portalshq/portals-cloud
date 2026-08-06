import {roomToken, verifyRoomToken, type RoomToken} from './pilot-tokens'
import {currentProfileToken} from './profile'
import {
  getProfileByToken,
  latestPilotByProfile,
  type StoredPilot,
} from './store'

export type RoomAccess = {
  token: RoomToken
  accessToken: string
}

/**
 * Resolves who may open a pilot room.
 *
 * A valid per-role `?t=` token is honored for anyone (submitter,
 * participant, approver, signer). When no valid token is present, access
 * falls back to the submitting browser: if the `portals_profile` cookie
 * belongs to the profile that most recently created this pilot, a fresh
 * submitter token is minted server-side so the person who completed the
 * form can open their room immediately without an emailed link.
 */
export async function resolveRoomAccess(
  pilot: StoredPilot | null,
  quotedToken?: string,
): Promise<RoomAccess | null> {
  if (!pilot) return null
  if (quotedToken) {
    const token = verifyRoomToken(quotedToken)
    if (token && token.pilotId === pilot.id) {
      return {token, accessToken: quotedToken}
    }
  }
  const profile = await getProfileByToken(await currentProfileToken())
  if (!profile) return null
  const latestPilot = await latestPilotByProfile(profile.id)
  if (!latestPilot || latestPilot.id !== pilot.id) return null
  const email = String(pilot.answers.email || '').trim()
  if (!email) return null
  const token: RoomToken = {pilotId: pilot.id, role: 'submitter', email}
  return {token, accessToken: roomToken(pilot.id, 'submitter', email)}
}