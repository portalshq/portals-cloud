import 'server-only'

export type BackendLeadData = {
  idempotencyKey: string
  email: string
  name?: string
  company?: string
  role?: string
  payload: Record<string, unknown>
}

export type BackendTeamInvitationData = {
  email: string
  customerAccountId: string
  role: 'admin' | 'member'
}

export type BackendPilotInvitationData = {
  email: string
  pilotId: string
  role: 'participant' | 'approver' | 'signer'
}

export type BackendInvitation = {
  id: string
  type: 'team_member' | 'pilot_room'
  role: string
  expiresAt: string
  status: 'pending' | 'accepted' | 'rejected' | 'expired'
}

function baseUrl(): string {
  const configured = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_API_URL
  if (!configured) throw new Error('BACKEND_API_URL is required before proxying a lead to the backend.')
  const url = new URL(configured)
  if (url.protocol !== 'https:') throw new Error('BACKEND_API_URL must use HTTPS.')
  return url.toString().replace(/\/$/, '')
}

function backendToken(): string {
  const token = process.env.BACKEND_API_SHARED_SECRET
  if (!token) throw new Error('BACKEND_API_SHARED_SECRET is required for server-to-server backend calls.')
  return token
}

/**
 * Server-only bridge for anonymous marketing submissions. The browser never
 * receives the integration secret; an App Router route calls this after its
 * existing abuse checks have passed.
 */
export async function submitLeadToBackend(data: BackendLeadData): Promise<{id: string; accepted: true}> {
  const response = await fetch(`${baseUrl()}/api/leads/submit`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'X-Portals-Backend-Token': backendToken(),
      'Idempotency-Key': data.idempotencyKey,
    },
    body: JSON.stringify(data),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok || !body?.id) {
    throw new Error(typeof body?.error === 'string' ? body.error : `Backend lead submission failed (${response.status}).`)
  }
  return body as {id: string; accepted: true}
}

async function createInvitationForActor(
  path: '/api/invitations/team' | '/api/invitations/pilot',
  actorId: string,
  data: BackendTeamInvitationData | BackendPilotInvitationData,
): Promise<BackendInvitation> {
  const response = await fetch(`${baseUrl()}${path}`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'X-Portals-Backend-Token': backendToken(),
      'X-Portals-Actor-Id': actorId,
    },
    body: JSON.stringify(data),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok || !body?.id) {
    throw new Error(typeof body?.error === 'string' ? body.error : `Backend invitation request failed (${response.status}).`)
  }
  return body as BackendInvitation
}

/** Server-side bridge for the existing cookie-session account UI. */
export function createTeamInvitationForActor(actorId: string, data: BackendTeamInvitationData): Promise<BackendInvitation> {
  return createInvitationForActor('/api/invitations/team', actorId, data)
}

/** Server-side bridge for the existing cookie-session pilot UI. */
export function createPilotInvitationForActor(actorId: string, data: BackendPilotInvitationData): Promise<BackendInvitation> {
  return createInvitationForActor('/api/invitations/pilot', actorId, data)
}
