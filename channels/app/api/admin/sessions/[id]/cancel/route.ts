import { authenticateAdmin } from "../../../../../../lib/admin/auth";
import { centralDb } from "../../../../../../lib/admin/db";
import { adminErrorResponse, json, notFound } from "../../../../../../lib/admin/http";
import { assertChannelInScope } from "../../../../../../lib/admin/scope";
import { invalidateCatalog } from "../../../../../../lib/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cancel a slot. Sessions are never hard-deleted — `cancelled` removes the
 * window from phase resolution (only `scheduled`/`live` count as on-air) and
 * from the scheduler's status sweep, while keeping the row auditable.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await authenticateAdmin(request);
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    const current = await centralDb().query<{ id: string; channel_id: string }>(
      "SELECT id, channel_id FROM station_program_slots WHERE id = $1",
      [id],
    );
    if (!current.rows.length) throw notFound("Session not found");
    assertChannelInScope(auth.scope, current.rows[0].channel_id);
    const result = await centralDb().query(
      `UPDATE station_program_slots SET status = 'cancelled' WHERE id = $1 RETURNING id`,
      [id],
    );
    if (!result.rows.length) throw notFound("Session not found");
    invalidateCatalog();
    return json({ id, status: "cancelled" });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
