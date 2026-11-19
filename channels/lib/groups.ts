import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { centralDb } from './admin/db'
import { audienceError, codePattern, transaction } from './audience'
import { getProgramRoom } from './catalog'

const newCode = () => randomBytes(24).toString('base64url')
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const defaultGroupName = (displayName: string) => `${displayName.trim().slice(0, 64) || 'Viewer'}’s group`.slice(0, 80)

type Tune = { stationId: string; programId?: never } | { programId: string; stationId?: never }
export type GroupDestinations = {
  stations: Array<{ id: string; name: string }>
  programs: Array<{ id: string; name: string; slug: string }>
}

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
    await db.query(`INSERT INTO viewer_groups (id, watch_code, invite_digest, name, owner_id, station_id, program_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, watchCode, digest(invite), defaultGroupName(displayName), userId, tune.stationId, tune.programId])
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
    return transaction(async db => {
      const membership = await db.query<{ id: string; owner: boolean }>(`
        SELECT g.id, g.owner_id = m.user_id AS owner FROM viewer_groups g
        JOIN viewer_group_members m ON m.group_id = g.id AND m.user_id = $2 AND m.active
        WHERE g.watch_code = $1 FOR UPDATE OF g, m
      `, [code, userId])
      if (!membership.rowCount) return { member: false }
      if (membership.rows[0].owner) audienceError(409, 'The owner must end the group.')
      await db.query('UPDATE viewer_group_members SET active = false WHERE group_id = $1 AND user_id = $2',
        [membership.rows[0].id, userId])
      return { member: false }
    })
  }
  if (body.action === 'end') {
    return transaction(async db => {
      const group = await db.query<{ id: string }>(`
        SELECT g.id FROM viewer_groups g JOIN viewer_group_members m
          ON m.group_id = g.id AND m.user_id = g.owner_id AND m.active
        JOIN users u ON u.id = m.user_id AND u.status = 'active'
        WHERE g.watch_code = $1 AND g.owner_id = $2 FOR UPDATE OF g
      `, [code, userId])
      if (!group.rowCount) audienceError(403, 'Only the group owner can end the group.')
      await db.query('DELETE FROM audience_chat WHERE group_id = $1', [group.rows[0].id])
      await db.query('DELETE FROM viewer_group_members WHERE group_id = $1', [group.rows[0].id])
      await db.query('DELETE FROM viewer_groups WHERE id = $1', [group.rows[0].id])
      return { member: false, ended: true }
    })
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
    revision: number; name: string; station_id: string | null; program_id: string | null; slug: string | null
    slot_id: string | null; boundary: Date | null; next_start: Date | null; member_count: number
  }>(`
    SELECT g.revision, g.name, g.station_id,
           coalesce(direct.id, current_slot.program_id, next_slot.program_id) AS program_id,
           coalesce(direct.slug, current_slot.slug, next_slot.slug) AS slug,
           coalesce(current_slot.id, next_slot.id) AS slot_id,
           CASE WHEN g.program_id IS NULL THEN coalesce(current_slot.ends_at, next_slot.starts_at) END AS boundary,
           next_slot.starts_at AS next_start, members.member_count
    FROM viewer_groups g LEFT JOIN programs direct ON direct.id = g.program_id
    LEFT JOIN LATERAL (
      SELECT s.id, s.program_id, p.slug, s.ends_at FROM station_program_slots s JOIN programs p ON p.id = s.program_id
      WHERE s.station_id = g.station_id AND s.status IN ('scheduled', 'live')
        AND s.starts_at <= now() AND now() < s.ends_at
      ORDER BY s.starts_at DESC LIMIT 1
    ) current_slot ON true
    LEFT JOIN LATERAL (
      SELECT s.id, s.program_id, p.slug, s.starts_at FROM station_program_slots s
      JOIN programs p ON p.id = s.program_id AND p.slug IS NOT NULL
      WHERE s.station_id = g.station_id AND s.status IN ('scheduled', 'live') AND s.starts_at > now()
      ORDER BY s.starts_at LIMIT 1
    ) next_slot ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS member_count FROM viewer_group_members m
      JOIN users u ON u.id = m.user_id AND u.status = 'active'
      WHERE m.group_id = g.id AND m.active
    ) members ON true
    WHERE g.watch_code = $1
  `, [code])
  const row = rows[0]
  return row && {
    revision: row.revision, name: row.name, memberCount: row.member_count,
    stationId: row.station_id ?? undefined, programId: row.program_id ?? undefined,
    slug: row.slug ?? undefined, slotId: row.slot_id ?? undefined,
    boundary: row.boundary?.toISOString(), nextSession: row.next_start?.toISOString(),
  }
}

export async function groupSnapshot(code: string) {
  const tuning = await groupTuning(code)
  return tuning && { ...tuning, channel: tuning.slug ? await getProgramRoom(tuning.slug) : undefined }
}

export async function groupDestinations(): Promise<GroupDestinations> {
  const db = centralDb()
  const [stations, programs] = await Promise.all([
    db.query<{ id: string; name: string }>('SELECT id, name FROM stations ORDER BY name, id'),
    db.query<{ id: string; name: string; slug: string }>(
      'SELECT id, name, slug FROM programs WHERE slug IS NOT NULL ORDER BY name, id',
    ),
  ])
  return { stations: stations.rows, programs: programs.rows }
}
