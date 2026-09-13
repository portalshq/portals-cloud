export function accountPath(accountId: string): string {
  return `/account/${encodeURIComponent(accountId)}`
}

export function pilotRoomPath(accountId: string, pilotId: string): string {
  return `${accountPath(accountId)}/pilot-room/${encodeURIComponent(pilotId)}`
}

export function pilotRoomPathForPilot(pilot: {
  id: string
  customerAccountId?: string
}): string {
  return pilot.customerAccountId
    ? pilotRoomPath(pilot.customerAccountId, pilot.id)
    : '/account'
}
