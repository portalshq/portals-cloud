export function accountPath(accountId: string): string {
  return `/account/${encodeURIComponent(accountId)}`
}

export function pilotRoomPath(accountId: string, pilotId: string): string {
  return `${accountPath(accountId)}/pilot-room/${encodeURIComponent(pilotId)}`
}

export function pilotRoomPathForPilot(pilot: {
  id: string
  customerAccountId?: string | null
}): string {
  if (!pilot.customerAccountId) throw new Error('Pilot is missing customerAccountId')
  return pilotRoomPath(pilot.customerAccountId, pilot.id)
}

export function pilotRoomPathForPilotOrFallback(
  pilot: {id: string; customerAccountId?: string | null},
  fallback = '/account',
): string {
  return pilot.customerAccountId ? pilotRoomPath(pilot.customerAccountId, pilot.id) : fallback
}

const LEGACY_PILOT_RE = /^\/paid-pilot\/room\/([^/]+)(?:\/revise)?\/?$/

export function extractLegacyPilotId(nextPath: string): string | null {
  try {
    const url = new URL(nextPath, 'https://example.com')
    const match = url.pathname.match(LEGACY_PILOT_RE)
    return match ? decodeURIComponent(match[1]) : null
  } catch {
    const match = nextPath.match(LEGACY_PILOT_RE)
    return match ? decodeURIComponent(match[1]) : null
  }
}

export function isLegacyPilotPath(nextPath: string): boolean {
  return extractLegacyPilotId(nextPath) !== null
}

export function legacyPilotPath(pilotId: string, revise = false, search = ''): string {
  return `/paid-pilot/room/${encodeURIComponent(pilotId)}${revise ? '/revise' : ''}${search}`
}

export function safeInternalPath(value: string | null | undefined, fallback = '/account'): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : fallback
}
