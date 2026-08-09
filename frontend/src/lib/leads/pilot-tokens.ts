import {signValue, verifySignature} from './crypto'

export const PILOT_SECRET_NAME = 'PILOT_ROOM_SECRET'

export type RoomToken = {
  pilotId: string
  role: 'submitter' | 'participant' | 'approver' | 'signer'
  email: string
}

export function roomToken(
  pilotId: string,
  role: RoomToken['role'],
  email: string,
): string {
  const payload = [pilotId, role, email.toLowerCase().trim()].join(':')
  return `${Buffer.from(payload, 'utf8').toString('base64url')}.${signValue(payload, PILOT_SECRET_NAME)}`
}

export function verifyRoomToken(token: string): RoomToken | null {
  const separator = token.indexOf('.')
  if (separator < 0) return null
  const rawPayload = token.slice(0, separator)
  const received = token.slice(separator + 1)
  let payload: string
  try {
    payload = Buffer.from(rawPayload, 'base64url').toString('utf8')
  } catch {
    return null
  }
  if (!verifySignature(payload, received, PILOT_SECRET_NAME)) return null
  const [pilotId, role, email] = payload.split(':')
  if (
    !pilotId ||
    !['submitter', 'participant', 'approver', 'signer'].includes(role) ||
    !email
  ) {
    return null
  }
  return {pilotId, role: role as RoomToken['role'], email}
}
