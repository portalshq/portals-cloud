import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { centralDb } from './admin/db'
import { audienceError, codePattern, transaction } from './audience'
import { getProgramRoom } from './catalog'

const newCode = () => randomBytes(24).toString('base64url')
const digest = (value: string) => createHash('sha256').update(value).digest('hex')

type Tune = { stationId: string; programId?: never } | { programId: string; stationId?: never }

function readTune(body: Record<string, unknown>): Tune {
  const id = (value: unknown) => typeof value === 'string' && value.trim() && value.length <= 128 ? value.trim() : undefined
  const stationId = id(body.stationId)
  const programId = id(body.programId)
  if (stationId && !programId && body.programId === undefined) return { stationId }
  if (programId && !stationId && body.stationId === undefined) return { programId }
  return audienceError(400, 'Choose one station or program.')
}

export async function tuneGroup(userId: string, displayName: string, body: Record<string, unknown>, code?: string) {
  const tune = readTune(body)
  return transaction(async db => {
    await db.query("INSERT INTO users (id, display_name) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING", [userId, displayName])
    const account = await db.query("SELECT 1 FROM users WHERE id = $1 AND status = 'active' FOR SHARE", [userId])
    if (!account.rowCount) audienceError(403, 'Account unavailable.')
    const target = tune.stationId
      ? await db.query('SELECT 1 FROM stations WHERE id = $1', [tune.stationId])
      : await db.query('SELECT 1 FROM programs WHERE id = $1 AND slug IS NOT NULL', [tune.programId])
    if (!target.rowCount) audienceError(404, 'Destination not found.')
    if (code) {
      if (!Number.isSafeInteger(body.revision)) audienceError(400, 'Invalid revision.')
      const update = await db.query(`
        UPDATE viewer_groups SET station_id = $1, program_id = $2, revision = revision + 1
        WHERE watch_code = $3 AND owner_id = $4 AND revision = $5
          AND EXISTS (SELECT 1 FROM viewer_group_members m WHERE m.group_id = viewer_groups.id AND m.user_id = $4 AND m.active)
        RETURNING revision
      `, [tune.stationId, tune.programId, code, userId, body.revision])
      if (!update.rowCount) audienceError(409, 'Group tuning could not be updated.')
      return update.rows[0]
    }
    const id = randomUUID()
    const watchCode = newCode()
    const invite = newCode()
    await db.query('INSERT INTO viewer_groups (id, watch_code, invite_digest, owner_id, station_id, program_id) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, watchCode, digest(invite), userId, tune.stationId, tune.programId])
    await db.query('INSERT INTO viewer_group_members (group_id, user_id) VALUES ($1,$2)', [id, userId])
    return { code: watchCode, invite, revision: 1 }
  })
}

export async function groupMember(code: string, userId: string) {
  const { rows } = await centralDb().query<{ id: string; owner: boolean }>(`
    SELECT g.id, g.owner_id = m.user_id AS owner FROM viewer_groups g
    JOIN viewer_group_members m ON m.group_id = g.id
    JOIN users u ON u.id = m.user_id AND u.status = 'active'
    WHERE g.watch_code = $1 AND m.user_id = $2 AND m.active
  `, [code, userId])
  return rows[0]
}

export async function changeMembership(code: string, userId: string, displayName: string, body: Record<string, unknown>) {
  if (body.action === 'leave') {
    await centralDb().query(`UPDATE viewer_group_members m SET active = false
      FROM viewer_groups g WHERE m.group_id = g.id AND g.watch_code = $1 AND m.user_id = $2`, [code, userId])
    return { member: false }
  }
  if (body.action === 'invite') {
    const invite = newCode()
    const result = await centralDb().query(`UPDATE viewer_groups g SET invite_digest = $1
      FROM viewer_group_members m, users u
      WHERE g.watch_code = $2 AND g.owner_id = $3 AND u.id = g.owner_id AND u.status = 'active'
        AND m.group_id = g.id AND m.user_id = u.id AND m.active`,
    [digest(invite), code, userId])
    if (!result.rowCount) audienceError(403, 'Only the group owner can invite.')
    return { invite }
  }
  if (body.action === 'revoke') {
    const targetId = body.userId
    if (typeof targetId !== 'string' || !targetId.trim() || targetId.length > 256 || targetId === userId) {
      audienceError(400, 'Invalid member.')
    }
    const result = await centralDb().query(`
      UPDATE viewer_group_members target SET active = false, revoked = true
      FROM viewer_groups g JOIN viewer_group_members owner
        ON owner.group_id = g.id AND owner.user_id = g.owner_id AND owner.active
      JOIN users u ON u.id = owner.user_id AND u.status = 'active'
      WHERE g.watch_code = $1 AND g.owner_id = $2
        AND target.group_id = g.id AND target.user_id = $3
    `, [code, userId, targetId])
    if (!result.rowCount) audienceError(404, 'Member not found.')
    return { member: false }
  }
  const invite = body.invite
  if (body.action !== 'join' || typeof invite !== 'string' || !codePattern.test(invite)) {
    audienceError(400, 'A valid group invitation is required.')
  }
  await transaction(async db => {
    await db.query("INSERT INTO users (id, display_name) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING", [userId, displayName])
    const result = await db.query(`
      WITH allowed AS (
        SELECT g.id AS group_id, u.id AS user_id FROM viewer_groups g JOIN users u ON u.id = $3 AND u.status = 'active'
        WHERE g.watch_code = $1 AND g.invite_digest = $2 FOR SHARE OF g, u
      )
      INSERT INTO viewer_group_members (group_id, user_id)
      SELECT group_id, user_id FROM allowed
      ON CONFLICT (group_id, user_id) DO UPDATE SET active = true WHERE NOT viewer_group_members.revoked
    `, [code, digest(invite), userId])
    if (!result.rowCount) audienceError(403, 'The invitation is no longer available.')
  })
  return { member: true }
}

export async function groupTuning(code: string) {
  const { rows } = await centralDb().query<{
    revision: number; slug: string | null; slot_id: string | null; boundary: Date | null; next_start: Date | null
  }>(`
    SELECT g.revision, coalesce(direct.slug, current_slot.slug) AS slug,
           current_slot.id AS slot_id, coalesce(current_slot.ends_at, next_slot.starts_at) AS boundary,
           next_slot.starts_at AS next_start
    FROM viewer_groups g LEFT JOIN programs direct ON direct.id = g.program_id
    LEFT JOIN LATERAL (
      SELECT s.id, p.slug, s.ends_at FROM station_program_slots s JOIN programs p ON p.id = s.program_id
      WHERE s.station_id = g.station_id AND s.status IN ('scheduled', 'live')
        AND s.starts_at <= now() AND now() < s.ends_at
      ORDER BY s.starts_at DESC LIMIT 1
    ) current_slot ON true
    LEFT JOIN LATERAL (
      SELECT s.starts_at FROM station_program_slots s JOIN programs p ON p.id = s.program_id AND p.slug IS NOT NULL
      WHERE s.station_id = g.station_id AND s.status IN ('scheduled', 'live') AND s.starts_at > now()
      ORDER BY s.starts_at LIMIT 1
    ) next_slot ON true
    WHERE g.watch_code = $1
  `, [code])
  const row = rows[0]
  return row && {
    revision: row.revision, slug: row.slug ?? undefined, slotId: row.slot_id ?? undefined,
    boundary: row.boundary?.toISOString(), nextSession: row.next_start?.toISOString(),
  }
}

export async function groupSnapshot(code: string) {
  const tuning = await groupTuning(code)
  return tuning && { ...tuning, channel: tuning.slug ? await getProgramRoom(tuning.slug) : undefined }
}
