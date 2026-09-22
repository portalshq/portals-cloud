export type BackendRequestOptions = {
  /** A short-lived Cognito access token; never use a server integration secret here. */
  accessToken: string
  signal?: AbortSignal
}

export type TeamInvitationData = {
  email: string
  customerAccountId: string
  role: 'admin' | 'member'
}

export type PilotInvitationData = {
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

function backendBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_BACKEND_API_URL
  if (!configured) {
    throw new Error('NEXT_PUBLIC_BACKEND_API_URL is required before calling the backend API.')
  }
  const url = new URL(configured)
  if (url.protocol !== 'https:') {
    throw new Error('The backend API URL must use HTTPS.')
  }
  return url.toString().replace(/\/$/, '')
}

async function request<T>(
  path: string,
  init: RequestInit,
  options: BackendRequestOptions,
): Promise<T> {
  const response = await fetch(`${backendBaseUrl()}${path}`, {
    ...init,
    signal: options.signal,
    credentials: 'omit',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${options.accessToken}`,
      ...init.headers,
    },
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const message = typeof body?.error === 'string' ? body.error : `Backend request failed (${response.status}).`
    throw new Error(message)
  }
  return body as T
}

export function createTeamInvitation(
  data: TeamInvitationData,
  options: BackendRequestOptions,
): Promise<BackendInvitation> {
  return request('/api/invitations/team', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data),
  }, options)
}

export function createPilotInvitation(
  data: PilotInvitationData,
  options: BackendRequestOptions,
): Promise<BackendInvitation> {
  return request('/api/invitations/pilot', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data),
  }, options)
}
