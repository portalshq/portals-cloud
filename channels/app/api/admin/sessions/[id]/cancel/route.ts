import { requireAdmin } from "../../../../../../lib/admin/auth";
import { centralDb } from "../../../../../../lib/admin/db";
import { adminErrorResponse, json, notFound } from "../../../../../../lib/admin/http";

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
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await context.params;
    const result = await centralDb().query(
      `UPDATE station_program_slots SET status = 'cancelled' WHERE id = $1 RETURNING id`,
      [id],
    );
    if (!result.rows.length) throw notFound("Session not found");
    return json({ id, status: "cancelled" });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
