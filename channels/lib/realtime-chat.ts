import { createRealtime, rawSql } from '@neon/realtime/server'
import type { ChatScope } from './audience-chat'

export type LiveChatMessage = { id: string; name: string; text: string; sentAt: string }

let issuer: ReturnType<typeof createRealtime> | undefined

function config() {
  if (process.env.CHANNELS_REALTIME_CHAT_ENABLED !== 'true') return
  const secret = process.env.NEON_REALTIME_SECRET?.trim()
  const url = process.env.NEXT_PUBLIC_NEON_REALTIME_URL?.trim()
  const db = process.env.NEON_REALTIME_DB?.trim()
  if (!secret || !url || !db) return
  return { secret, url, db }
}

/** Seal the exact bounded thread query; the browser never receives the secret. */
export async function sealChat(scope: ChatScope, limit: number) {
  const realtime = config()
  if (!realtime) return
  issuer ??= createRealtime({ secret: realtime.secret, db: realtime.db })
  const query = scope.kind === 'program'
    ? rawSql<LiveChatMessage>(`
        SELECT position::text AS id, display_name AS name, text, sent_at::text AS "sentAt"
        FROM audience_chat
        WHERE group_id IS NULL AND program_id = $1
        ORDER BY position DESC LIMIT $2`, [scope.programId, limit])
    : rawSql<LiveChatMessage>(`
        SELECT c.position::text AS id, c.display_name AS name, c.text, c.sent_at::text AS "sentAt"
        FROM audience_chat c
        WHERE c.group_id = $1
          AND EXISTS (
            SELECT 1 FROM viewer_group_members m
            JOIN users u ON u.id = m.user_id AND u.status = 'active'
            WHERE m.group_id = c.group_id AND m.user_id = $2 AND m.active
          )
        ORDER BY c.position DESC LIMIT $3`, [scope.groupId, scope.userId!, limit])
  return { query: await issuer.seal({ query }), url: realtime.url }
}

export function resetRealtimeChatForTest() {
  issuer = undefined
}
