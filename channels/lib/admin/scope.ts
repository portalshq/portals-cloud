/**
 * Scope enforcement for the admin routes. `authenticateAdmin` establishes the
 * scope; these helpers apply it to queries and mutations. Channel-scoped
 * reads add a `channel_id = ANY($n)` clause; channel-scoped writes assert the
 * target channel before touching the row.
 */

import type { AdminScope } from "./auth";
import { forbidden } from "./http";

export function channelInScope(scope: AdminScope, channelId: string): boolean {
  return scope.allChannels || scope.channelIds.includes(channelId);
}

/** Throws 403 when the channel is outside the token's scope. */
export function assertChannelInScope(scope: AdminScope, channelId: string): void {
  if (!channelInScope(scope, channelId)) {
    throw forbidden(`Channel ${channelId} is outside this token's scope`);
  }
}

/**
 * Appends the scope restriction for channel-keyed SELECTs. Returns null for
 * the superuser scope (no clause). When a clause is returned the channelIds
 * array has been pushed onto `values` as the next bind parameter.
 */
export function scopedChannelClause(scope: AdminScope, values: unknown[]): string | null {
  if (scope.allChannels) return null;
  values.push(scope.channelIds);
  return `channel_id = ANY($${values.length})`;
}

/** Minimal pg pool surface so tests can pass a stub. */
type QueryPool = {
  query: (sql: string, values: unknown[]) => Promise<{ rows: { channel_id: string }[] }>;
};

/**
 * A program may be edited only when every channel it is bound to (via rules
 * or slots) is inside the scope — otherwise a scoped operator could change
 * copy shown on channels outside their scope. Unbound programs are editable
 * only by the superuser.
 */
export async function assertProgramEditable(scope: AdminScope, pool: QueryPool, programId: string): Promise<void> {
  if (scope.allChannels) return;
  const { rows } = await pool.query(
    `SELECT DISTINCT channel_id FROM (
       SELECT channel_id FROM station_schedule_rules WHERE program_id = $1
       UNION
       SELECT channel_id FROM station_program_slots WHERE program_id = $1
     ) bindings`,
    [programId],
  );
  const channelIds = rows.map((row) => row.channel_id);
  if (!channelIds.length) {
    throw forbidden("Program is not bound to any channel in this token's scope");
  }
  const outsideScope = channelIds.filter((channelId) => !channelInScope(scope, channelId));
  if (outsideScope.length) {
    throw forbidden(`Program ${programId} is bound to channels outside this token's scope: ${outsideScope.join(", ")}`);
  }
}
