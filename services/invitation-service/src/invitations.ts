import {randomUUID} from 'node:crypto'
import type {PoolClient} from 'pg'
import {ensureCognitoUser} from './cognito.js'
import {decryptJson, encryptJson, hashValue, randomToken} from './crypto.js'
import {pool} from './db.js'
import {sendInvitationEmail} from './email.js'

export type InvitationType = 'team_member' | 'pilot_room'
export type InvitationStatus = 'pending' | 'accepted' | 'rejected' | 'expired'

type InvitationRow = {
  id: string
  type: InvitationType
  email_ciphertext: string
  customer_account_id: string | null
  pilot_id: string | null
  role: string
  expires_at: Date
  status: InvitationStatus
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 254) throw new Error('A valid invitation email is required.')
  return normalized
}

function expiresAt(): Date {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
}

async function assertCanInvite(client: PoolClient, actorId: string, type: InvitationType, customerAccountId?: string, pilotId?: string): Promise<void> {
  const query = type === 'team_member'
    ? `SELECT 1 FROM customer_memberships WHERE customer_account_id = $1 AND user_id = $2 AND role IN ('owner', 'admin') AND revoked_at IS NULL`
    : `SELECT 1 FROM pilot_memberships WHERE pilot_id = $1 AND user_id = $2 AND role = 'owner' AND revoked_at IS NULL`
  const targetId = type === 'team_member' ? customerAccountId : pilotId
  const result = await client.query(query, [targetId, actorId])
  if (!result.rows[0]) throw new Error('The current user is not allowed to invite members to this target.')
}

function inviteResponse(row: InvitationRow) {
  return {id: row.id, type: row.type, role: row.role, expiresAt: row.expires_at.toISOString(), status: row.status}
}

export async function createInvitation(input: {
  actorId: string
  type: InvitationType
  email: string
  customerAccountId?: string
  pilotId?: string
  role: string
}): Promise<ReturnType<typeof inviteResponse>> {
  const email = normalizeEmail(input.email)
  if (input.type === 'team_member' && (!input.customerAccountId || !['admin', 'member'].includes(input.role))) throw new Error('Team invitations require a customer account and an admin or member role.')
  if (input.type === 'pilot_room' && (!input.pilotId || !['participant', 'approver', 'signer'].includes(input.role))) throw new Error('Pilot invitations require a pilot and a supported pilot role.')
  const client = await pool.connect()
  const token = randomToken()
  const expiration = expiresAt()
  try {
    await client.query('BEGIN')
    await assertCanInvite(client, input.actorId, input.type, input.customerAccountId, input.pilotId)
    const existing = await client.query<InvitationRow>(
      `SELECT id, type, email_ciphertext, customer_account_id, pilot_id, role, expires_at, status
       FROM invitations
       WHERE type = $1 AND email_hash = $2
         AND customer_account_id IS NOT DISTINCT FROM $3
         AND pilot_id IS NOT DISTINCT FROM $4
         AND status = 'pending'
       FOR UPDATE`,
      [input.type, hashValue(email), input.customerAccountId || null, input.pilotId || null],
    )
    if (existing.rows[0]) {
      await client.query(`UPDATE invitations SET status = 'expired' WHERE id = $1`, [existing.rows[0].id])
    }
    const invitation: InvitationRow = {
      id: randomUUID(), type: input.type, email_ciphertext: encryptJson({email}),
      customer_account_id: input.customerAccountId || null, pilot_id: input.pilotId || null,
      role: input.role, expires_at: expiration, status: 'pending',
    }
    await client.query(
      `INSERT INTO invitations(id, type, email_hash, email_ciphertext, customer_account_id, pilot_id, role, invited_by_user_id, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [invitation.id, invitation.type, hashValue(email), invitation.email_ciphertext, invitation.customer_account_id, invitation.pilot_id, invitation.role, input.actorId, expiration],
    )
    await client.query(
      `INSERT INTO invitation_tokens(id, invitation_id, token_hash, expires_at) VALUES ($1,$2,$3,$4)`,
      [randomUUID(), invitation.id, hashValue(token), expiration],
    )
    await client.query('COMMIT')
    await sendInvitationEmail({type: invitation.type, email, token})
    return inviteResponse(invitation)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

async function invitationForToken(client: PoolClient, token: string, lock = false): Promise<InvitationRow | null> {
  const result = await client.query<InvitationRow>(
    `SELECT invitation.id, invitation.type, invitation.email_ciphertext, invitation.customer_account_id,
            invitation.pilot_id, invitation.role, invitation.expires_at, invitation.status
       FROM invitation_tokens token
       JOIN invitations invitation ON invitation.id = token.invitation_id
      WHERE token.token_hash = $1 AND token.used_at IS NULL AND token.expires_at > now()${lock ? ' FOR UPDATE OF token, invitation' : ''}`,
    [hashValue(token)],
  )
  return result.rows[0] || null
}

export async function validateInvitation(token: string): Promise<ReturnType<typeof inviteResponse> | null> {
  const client = await pool.connect()
  try {
    const invitation = await invitationForToken(client, token)
    return invitation && invitation.status === 'pending' ? inviteResponse(invitation) : null
  } finally {
    client.release()
  }
}

async function ensureApplicationUser(client: PoolClient, email: string, cognitoSubject: string): Promise<string> {
  const emailHash = hashValue(email)
  const existing = await client.query<{id: string}>(`SELECT id FROM application_users WHERE email_hash = $1 FOR UPDATE`, [emailHash])
  if (existing.rows[0]) {
    await client.query(`UPDATE application_users SET cognito_subject = COALESCE(cognito_subject, $2), updated_at = now() WHERE id = $1`, [existing.rows[0].id, cognitoSubject])
    return existing.rows[0].id
  }
  const id = randomUUID()
  await client.query(
    `INSERT INTO application_users(id, email_hash, identity_ciphertext, cognito_subject) VALUES ($1,$2,$3,$4)`,
    [id, emailHash, encryptJson({email}), cognitoSubject],
  )
  return id
}

export async function acceptInvitation(token: string): Promise<ReturnType<typeof inviteResponse>> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const invitation = await invitationForToken(client, token, true)
    if (!invitation || invitation.status !== 'pending') throw new Error('This invitation is invalid or has expired.')
    const email = decryptJson<{email: string}>(invitation.email_ciphertext).email
    const cognitoSubject = await ensureCognitoUser(email)
    const userId = await ensureApplicationUser(client, email, cognitoSubject)
    if (invitation.type === 'team_member') {
      await client.query(
        `INSERT INTO customer_memberships(customer_account_id, user_id, role) VALUES ($1,$2,$3)
         ON CONFLICT(customer_account_id, user_id) DO UPDATE SET role = EXCLUDED.role, revoked_at = NULL`,
        [invitation.customer_account_id, userId, invitation.role],
      )
    } else {
      await client.query(
        `INSERT INTO pilot_memberships(pilot_id, user_id, role) VALUES ($1,$2,$3)
         ON CONFLICT(pilot_id, user_id, role) DO UPDATE SET revoked_at = NULL`,
        [invitation.pilot_id, userId, invitation.role],
      )
    }
    await client.query(`UPDATE invitation_tokens SET used_at = now() WHERE token_hash = $1`, [hashValue(token)])
    const accepted = await client.query<InvitationRow>(
      `UPDATE invitations SET status = 'accepted', accepted_at = now(), invited_user_id = $2 WHERE id = $1
       RETURNING id, type, email_ciphertext, customer_account_id, pilot_id, role, expires_at, status`,
      [invitation.id, userId],
    )
    await client.query('COMMIT')
    return inviteResponse(accepted.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function rejectInvitation(token: string): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const invitation = await invitationForToken(client, token, true)
    if (!invitation || invitation.status !== 'pending') throw new Error('This invitation is invalid or has expired.')
    await client.query(`UPDATE invitation_tokens SET used_at = now() WHERE token_hash = $1`, [hashValue(token)])
    await client.query(`UPDATE invitations SET status = 'rejected', rejected_at = now() WHERE id = $1`, [invitation.id])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function listInvitations(actorId: string): Promise<ReturnType<typeof inviteResponse>[]> {
  const result = await pool.query<InvitationRow>(
    `SELECT invitation.id, invitation.type, invitation.email_ciphertext, invitation.customer_account_id,
            invitation.pilot_id, invitation.role, invitation.expires_at, invitation.status
       FROM invitations invitation
      WHERE invitation.status = 'pending'
        AND invitation.expires_at > now()
        AND (
          invitation.invited_by_user_id = $1
          OR EXISTS (SELECT 1 FROM customer_memberships m WHERE m.customer_account_id = invitation.customer_account_id AND m.user_id = $1 AND m.role IN ('owner', 'admin') AND m.revoked_at IS NULL)
          OR EXISTS (SELECT 1 FROM pilot_memberships m WHERE m.pilot_id = invitation.pilot_id AND m.user_id = $1 AND m.role = 'owner' AND m.revoked_at IS NULL)
        )
      ORDER BY invitation.created_at DESC`,
    [actorId],
  )
  return result.rows.map(inviteResponse)
}
