import {randomUUID} from 'node:crypto'
import {decryptJson, encryptJson, hashValue, randomToken} from './crypto'
import {normalizeEmail} from './identity'
import {leadPool, leadsDryRun, type StoredProfile} from './store'

export const APP_SESSION_COOKIE = 'portals_session'
export const APP_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14
const MAGIC_LINK_MAX_AGE_SECONDS = 60 * 15

export type ApplicationRole = 'owner' | 'admin' | 'member'
export type PilotMemberRole = 'owner' | 'participant' | 'approver' | 'signer'

export type ApplicationUser = {
  id: string
  profileId?: string
  email: string
  displayName: string
  status: 'active' | 'suspended'
}

export type CustomerAccount = {
  id: string
  name: string
  domain?: string
  stripeCustomerId?: string
}

type UserRow = {
  id: string
  profile_id: string | null
  identity_ciphertext: string
  display_name: string
  status: 'active' | 'suspended'
}

const memory = globalThis as typeof globalThis & {
  portalsApplicationAuth?: {
    users: Map<string, ApplicationUser>
    customers: Map<string, CustomerAccount>
    memberships: Map<string, ApplicationRole>
    pilotMemberships: Map<string, PilotMemberRole>
    magicLinks: Map<string, {
      userId: string
      purpose: 'sign_in' | 'invite'
      customerAccountId?: string
      role?: ApplicationRole
      nextPath?: string
      expiresAt: number
    }>
    sessions: Map<string, {userId: string; expiresAt: number}>
  }
}

function memoryStore() {
  memory.portalsApplicationAuth ||= {
    users: new Map(),
    customers: new Map(),
    memberships: new Map(),
    pilotMemberships: new Map(),
    magicLinks: new Map(),
    sessions: new Map(),
  }
  return memory.portalsApplicationAuth
}

function memberKey(customerAccountId: string, userId: string) {
  return `${customerAccountId}:${userId}`
}

function pilotMemberKey(pilotId: string, userId: string) {
  return `${pilotId}:${userId}`
}

function userFromRow(row: UserRow): ApplicationUser {
  const identity = decryptJson<{email: string}>(row.identity_ciphertext)
  return {
    id: row.id,
    profileId: row.profile_id || undefined,
    email: identity.email,
    displayName: row.display_name,
    status: row.status,
  }
}

export async function getApplicationUserById(id: string): Promise<ApplicationUser | null> {
  if (leadsDryRun()) return memoryStore().users.get(id) || null
  const result = await leadPool().query<UserRow>(
    `SELECT id, profile_id, identity_ciphertext, display_name, status
       FROM application_users WHERE id = $1`,
    [id],
  )
  return result.rows[0] ? userFromRow(result.rows[0]) : null
}

export async function getApplicationUserByEmail(email: string): Promise<ApplicationUser | null> {
  const emailHash = hashValue(normalizeEmail(email))
  if (leadsDryRun()) {
    return [...memoryStore().users.values()].find(
      (candidate) => hashValue(normalizeEmail(candidate.email)) === emailHash,
    ) || null
  }
  const result = await leadPool().query<UserRow>(
    `SELECT id, profile_id, identity_ciphertext, display_name, status
       FROM application_users WHERE email_hash = $1`,
    [emailHash],
  )
  return result.rows[0] ? userFromRow(result.rows[0]) : null
}

export async function ensureApplicationUser(input: {
  email: string
  displayName?: string
  profileId?: string
}): Promise<ApplicationUser> {
  const email = normalizeEmail(input.email)
  const existing = await getApplicationUserByEmail(email)
  if (existing) {
    if (leadsDryRun()) {
      existing.profileId ||= input.profileId
      existing.displayName ||= input.displayName || ''
      memoryStore().users.set(existing.id, existing)
      return existing
    }
    const result = await leadPool().query<UserRow>(
      `UPDATE application_users
          SET profile_id = COALESCE(profile_id, $2),
              display_name = CASE WHEN display_name = '' THEN $3 ELSE display_name END,
              updated_at = now()
        WHERE id = $1
        RETURNING id, profile_id, identity_ciphertext, display_name, status`,
      [existing.id, input.profileId || null, input.displayName || ''],
    )
    return userFromRow(result.rows[0])
  }
  const user: ApplicationUser = {
    id: randomUUID(),
    profileId: input.profileId,
    email,
    displayName: input.displayName || '',
    status: 'active',
  }
  if (leadsDryRun()) {
    memoryStore().users.set(user.id, user)
    return user
  }
  const result = await leadPool().query<UserRow>(
    `INSERT INTO application_users(id, profile_id, email_hash, identity_ciphertext, display_name)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id, profile_id, identity_ciphertext, display_name, status`,
    [
      user.id,
      user.profileId || null,
      hashValue(user.email),
      encryptJson({email: user.email}),
      user.displayName,
    ],
  )
  return userFromRow(result.rows[0])
}

export async function ensurePilotCustomerAccount(input: {
  pilotId: string
  profile: StoredProfile
  companyName?: string
}): Promise<{user: ApplicationUser; customer: CustomerAccount}> {
  const email = input.profile.identity.email
  if (!email) throw new Error('A pilot applicant email is required to create an application account.')
  const user = await ensureApplicationUser({
    email,
    displayName: input.profile.identity.name,
    profileId: input.profile.id,
  })
  const domain = input.profile.companyDomain || undefined
  const accountName = input.companyName || input.profile.identity.company || domain || email
  const founderEmail = String(process.env.LEADS_NOTIFICATION_EMAIL || '').trim()
  const founder = founderEmail && normalizeEmail(founderEmail) !== email
    ? await ensureApplicationUser({email: founderEmail, displayName: 'portals team'})
    : null
  if (leadsDryRun()) {
    const stored = memoryStore()
    const ownedCustomerId = [...stored.memberships.entries()].find(
      ([key, role]) => key.endsWith(`:${user.id}`) && role === 'owner',
    )?.[0].split(':')[0]
    const customer = (ownedCustomerId ? stored.customers.get(ownedCustomerId) : undefined)
      || {id: randomUUID(), name: accountName, domain}
    stored.customers.set(customer.id, customer)
    stored.memberships.set(memberKey(customer.id, user.id), 'owner')
    stored.pilotMemberships.set(pilotMemberKey(input.pilotId, user.id), 'owner')
    if (founder) {
      stored.memberships.set(memberKey(customer.id, founder.id), 'admin')
      stored.pilotMemberships.set(pilotMemberKey(input.pilotId, founder.id), 'approver')
    }
    return {user, customer}
  }

  const client = await leadPool().connect()
  try {
    await client.query('BEGIN')
    const owned = await client.query<CustomerAccount>(
      `SELECT customer.id, customer.name, customer.domain,
              customer.stripe_customer_id AS "stripeCustomerId"
         FROM customer_accounts customer
         JOIN customer_memberships membership ON membership.customer_account_id = customer.id
        WHERE membership.user_id = $1 AND membership.role = 'owner' AND membership.revoked_at IS NULL
        ORDER BY membership.created_at ASC
        LIMIT 1 FOR UPDATE OF customer`,
      [user.id],
    )
    let customer = owned.rows[0]
    if (!customer) {
      const domainMatch = domain
        ? await client.query<{id: string}>(
            'SELECT id FROM customer_accounts WHERE domain = $1 FOR UPDATE',
            [domain],
          )
        : {rows: [] as {id: string}[]}
      // A matching domain is only a duplicate-review signal. It must never
      // grant an unrelated applicant access to an existing organization.
      customer = {
        id: randomUUID(),
        name: accountName,
        domain: domainMatch.rows[0] ? undefined : domain,
      }
      await client.query(
        `INSERT INTO customer_accounts(id, name, domain) VALUES ($1,$2,$3)`,
        [customer.id, customer.name, customer.domain || null],
      )
    }
    await client.query(
      `INSERT INTO customer_memberships(customer_account_id, user_id, role)
       VALUES ($1,$2,'owner')
       ON CONFLICT(customer_account_id, user_id)
       DO UPDATE SET revoked_at = NULL`,
      [customer.id, user.id],
    )
    await client.query(
      `INSERT INTO pilot_memberships(pilot_id, user_id, role)
       VALUES ($1,$2,'owner')
       ON CONFLICT(pilot_id, user_id)
       DO UPDATE SET role = 'owner', revoked_at = NULL`,
      [input.pilotId, user.id],
    )
    if (founder) {
      await client.query(
        `INSERT INTO customer_memberships(customer_account_id, user_id, role)
         VALUES ($1,$2,'admin') ON CONFLICT(customer_account_id, user_id)
         DO UPDATE SET role = 'admin', revoked_at = NULL`,
        [customer.id, founder.id],
      )
      await client.query(
        `INSERT INTO pilot_memberships(pilot_id, user_id, role)
         VALUES ($1,$2,'approver') ON CONFLICT(pilot_id, user_id)
         DO UPDATE SET role = 'approver', revoked_at = NULL`,
        [input.pilotId, founder.id],
      )
    }
    await client.query(
      `UPDATE lead_pilots SET customer_account_id = $2, updated_at = now() WHERE id = $1`,
      [input.pilotId, customer.id],
    )
    await client.query(
      `INSERT INTO application_audit_events(customer_account_id, pilot_id, actor_user_id, event_type)
       VALUES ($1,$2,$3,'pilot_applicant_account_created')`,
      [customer.id, input.pilotId, user.id],
    )
    await client.query('COMMIT')
    return {user, customer}
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

/** Links a verified Stripe customer to the application-owned customer account. */
export async function linkPilotStripeCustomer(pilotId: string, stripeCustomerId?: string | null): Promise<void> {
  if (!stripeCustomerId || leadsDryRun()) return
  await leadPool().query(
    `UPDATE customer_accounts customer
        SET stripe_customer_id = $2, updated_at = now()
       FROM lead_pilots pilot
      WHERE pilot.id = $1 AND pilot.customer_account_id = customer.id
        AND (customer.stripe_customer_id IS NULL OR customer.stripe_customer_id = $2)`,
    [pilotId, stripeCustomerId],
  )
}

export async function issueMagicLink(input: {
  userId: string
  purpose: 'sign_in' | 'invite'
  customerAccountId?: string
  role?: ApplicationRole
  nextPath?: string
  maxAgeSeconds?: number
}): Promise<string> {
  const token = randomToken()
  const tokenHash = hashValue(token)
  const expiresAt = new Date(Date.now() + (input.maxAgeSeconds || MAGIC_LINK_MAX_AGE_SECONDS) * 1000)
  if (leadsDryRun()) {
    memoryStore().magicLinks.set(tokenHash, {
      userId: input.userId,
      purpose: input.purpose,
      customerAccountId: input.customerAccountId,
      role: input.role,
      nextPath: input.nextPath,
      expiresAt: expiresAt.getTime(),
    })
    return token
  }
  await leadPool().query(
    `INSERT INTO auth_magic_links(token_hash, user_id, purpose, customer_account_id, role, next_path, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      tokenHash,
      input.userId,
      input.purpose,
      input.customerAccountId || null,
      input.role || null,
      input.nextPath || null,
      expiresAt,
    ],
  )
  return token
}

export async function consumeMagicLink(token: string): Promise<{sessionToken: string; user: ApplicationUser; nextPath?: string} | null> {
  const tokenHash = hashValue(token)
  if (leadsDryRun()) {
    const stored = memoryStore().magicLinks.get(tokenHash)
    if (!stored || stored.expiresAt < Date.now()) return null
    memoryStore().magicLinks.delete(tokenHash)
    if (stored.customerAccountId && stored.role) {
      memoryStore().memberships.set(memberKey(stored.customerAccountId, stored.userId), stored.role)
    }
    const sessionToken = randomToken()
    memoryStore().sessions.set(hashValue(sessionToken), {
      userId: stored.userId,
      expiresAt: Date.now() + APP_SESSION_MAX_AGE_SECONDS * 1000,
    })
    const user = await getApplicationUserById(stored.userId)
    return user ? {sessionToken, user, nextPath: stored.nextPath} : null
  }
  const client = await leadPool().connect()
  try {
    await client.query('BEGIN')
    const link = await client.query<{
      user_id: string
      customer_account_id: string | null
      role: ApplicationRole | null
      next_path: string | null
    }>(
      `UPDATE auth_magic_links SET consumed_at = now()
        WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > now()
        RETURNING user_id, customer_account_id, role, next_path`,
      [tokenHash],
    )
    const row = link.rows[0]
    if (!row) {
      await client.query('ROLLBACK')
      return null
    }
    if (row.customer_account_id && row.role) {
      await client.query(
        `INSERT INTO customer_memberships(customer_account_id, user_id, role)
         VALUES ($1,$2,$3)
         ON CONFLICT(customer_account_id, user_id)
         DO UPDATE SET role = EXCLUDED.role, revoked_at = NULL`,
        [row.customer_account_id, row.user_id, row.role],
      )
    }
    const sessionToken = randomToken()
    await client.query(
      `INSERT INTO application_sessions(token_hash, user_id, expires_at)
       VALUES ($1,$2,now() + interval '14 days')`,
      [hashValue(sessionToken), row.user_id],
    )
    await client.query('COMMIT')
    const user = await getApplicationUserById(row.user_id)
    return user ? {sessionToken, user, nextPath: row.next_path || undefined} : null
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function inspectMagicLink(token: string): Promise<{
  user: ApplicationUser
  purpose: 'sign_in' | 'invite'
  customerAccountId?: string
  role?: ApplicationRole
  nextPath?: string
  expired: boolean
  consumed: boolean
} | null> {
  const tokenHash = hashValue(token)
  if (leadsDryRun()) {
    const stored = memoryStore().magicLinks.get(tokenHash)
    const user = stored ? await getApplicationUserById(stored.userId) : null
    return stored && user
      ? {
          user,
          purpose: stored.purpose,
          customerAccountId: stored.customerAccountId,
          role: stored.role,
          nextPath: stored.nextPath,
          expired: stored.expiresAt < Date.now(),
          consumed: false,
        }
      : null
  }
  const result = await leadPool().query<{
    user_id: string
    purpose: 'sign_in' | 'invite'
    customer_account_id: string | null
    role: ApplicationRole | null
    next_path: string | null
    expires_at: Date | string
    consumed_at: Date | string | null
  }>(
    `SELECT user_id, purpose, customer_account_id, role, next_path, expires_at, consumed_at
       FROM auth_magic_links WHERE token_hash = $1`,
    [tokenHash],
  )
  const row = result.rows[0]
  const user = row ? await getApplicationUserById(row.user_id) : null
  return row && user
    ? {
        user,
        purpose: row.purpose,
        customerAccountId: row.customer_account_id || undefined,
        role: row.role || undefined,
        nextPath: row.next_path || undefined,
        expired: new Date(row.expires_at).getTime() < Date.now(),
        consumed: Boolean(row.consumed_at),
      }
    : null
}

export async function currentApplicationUser(sessionToken?: string): Promise<ApplicationUser | null> {
  if (!sessionToken) return null
  const tokenHash = hashValue(sessionToken)
  if (leadsDryRun()) {
    const session = memoryStore().sessions.get(tokenHash)
    return session && session.expiresAt > Date.now()
      ? getApplicationUserById(session.userId)
      : null
  }
  const result = await leadPool().query<{user_id: string}>(
    `UPDATE application_sessions SET last_seen_at = now()
      WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
      RETURNING user_id`,
    [tokenHash],
  )
  return result.rows[0] ? getApplicationUserById(result.rows[0].user_id) : null
}

export async function pilotMembershipRole(pilotId: string, userId: string): Promise<PilotMemberRole | null> {
  if (leadsDryRun()) return memoryStore().pilotMemberships.get(pilotMemberKey(pilotId, userId)) || null
  const result = await leadPool().query<{role: PilotMemberRole}>(
    `SELECT role FROM pilot_memberships
      WHERE pilot_id = $1 AND user_id = $2 AND revoked_at IS NULL`,
    [pilotId, userId],
  )
  return result.rows[0]?.role || null
}

export async function invitePilotMember(input: {
  pilotId: string
  email: string
  displayName?: string
  role: Exclude<PilotMemberRole, 'owner'>
}): Promise<{user: ApplicationUser; customerAccountId: string}> {
  const user = await ensureApplicationUser({email: input.email, displayName: input.displayName})
  if (leadsDryRun()) {
    const customer = [...memoryStore().customers.values()][0]
    if (!customer) throw new Error('Pilot customer account is missing.')
    memoryStore().memberships.set(memberKey(customer.id, user.id), 'member')
    memoryStore().pilotMemberships.set(pilotMemberKey(input.pilotId, user.id), input.role)
    return {user, customerAccountId: customer.id}
  }
  const client = await leadPool().connect()
  try {
    await client.query('BEGIN')
    const pilot = await client.query<{customer_account_id: string | null}>(
      'SELECT customer_account_id FROM lead_pilots WHERE id = $1 FOR UPDATE',
      [input.pilotId],
    )
    const customerAccountId = pilot.rows[0]?.customer_account_id
    if (!customerAccountId) throw new Error('Pilot customer account is missing.')
    await client.query(
      `INSERT INTO customer_memberships(customer_account_id, user_id, role)
       VALUES ($1,$2,'member') ON CONFLICT(customer_account_id, user_id)
       DO UPDATE SET revoked_at = NULL`,
      [customerAccountId, user.id],
    )
    await client.query(
      `INSERT INTO pilot_memberships(pilot_id, user_id, role)
       VALUES ($1,$2,$3) ON CONFLICT(pilot_id, user_id)
       DO UPDATE SET role = EXCLUDED.role, revoked_at = NULL`,
      [input.pilotId, user.id, input.role],
    )
    await client.query(
      `INSERT INTO application_audit_events(customer_account_id, pilot_id, actor_user_id, event_type, detail)
       VALUES ($1,$2,$3,'pilot_member_invited',$4)`,
      [customerAccountId, input.pilotId, user.id, JSON.stringify({role: input.role})],
    )
    await client.query('COMMIT')
    return {user, customerAccountId}
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function ensurePilotRecipientAccess(input: {
  pilotId: string
  email: string
  displayName?: string
  pilotRole: PilotMemberRole
  customerRole?: ApplicationRole
}): Promise<{user: ApplicationUser; customerAccountId?: string}> {
  const user = await ensureApplicationUser({
    email: input.email,
    displayName: input.displayName,
  })
  if (leadsDryRun()) {
    const customer = [...memoryStore().customers.values()][0]
    if (customer && input.customerRole) {
      memoryStore().memberships.set(memberKey(customer.id, user.id), input.customerRole)
    }
    memoryStore().pilotMemberships.set(pilotMemberKey(input.pilotId, user.id), input.pilotRole)
    return {user, customerAccountId: customer?.id}
  }
  const client = await leadPool().connect()
  try {
    await client.query('BEGIN')
    const pilot = await client.query<{customer_account_id: string | null}>(
      'SELECT customer_account_id FROM lead_pilots WHERE id = $1 FOR UPDATE',
      [input.pilotId],
    )
    const customerAccountId = pilot.rows[0]?.customer_account_id || undefined
    if (customerAccountId && input.customerRole) {
      await client.query(
        `INSERT INTO customer_memberships(customer_account_id, user_id, role)
         VALUES ($1,$2,$3) ON CONFLICT(customer_account_id, user_id)
         DO UPDATE SET role = EXCLUDED.role, revoked_at = NULL`,
        [customerAccountId, user.id, input.customerRole],
      )
    }
    await client.query(
      `INSERT INTO pilot_memberships(pilot_id, user_id, role)
       VALUES ($1,$2,$3) ON CONFLICT(pilot_id, user_id)
       DO UPDATE SET role = EXCLUDED.role, revoked_at = NULL`,
      [input.pilotId, user.id, input.pilotRole],
    )
    await client.query('COMMIT')
    return {user, customerAccountId}
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function cleanupApplicationAuth(): Promise<void> {
  if (leadsDryRun()) return
  await leadPool().query('DELETE FROM auth_magic_links WHERE expires_at < now() OR consumed_at IS NOT NULL')
  await leadPool().query('DELETE FROM application_sessions WHERE expires_at < now() OR revoked_at IS NOT NULL')
}
