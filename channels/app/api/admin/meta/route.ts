import { authenticateAdmin } from "../../../../lib/admin/auth";
import { centralDb } from "../../../../lib/admin/db";
import { adminErrorResponse, json } from "../../../../lib/admin/http";
import type { AdminMetaDto } from "../../../../lib/admin/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Picklists for schedule/session create forms. A scoped token only sees the
 *  programs bound to its channels; stations are shared platform records. */
export async function GET(request: Request): Promise<Response> {
  const auth = await authenticateAdmin(request);
  if (!auth.ok) return auth.response;
  try {
    const [stations, programs] = await Promise.all([
      centralDb().query<{ id: string; name: string }>("SELECT id, name FROM stations ORDER BY id"),
      auth.scope.allChannels
        ? centralDb().query<{ id: string; name: string; tenant_id: string | null }>(
            "SELECT id, name, tenant_id FROM programs ORDER BY id",
          )
        : centralDb().query<{ id: string; name: string; tenant_id: string | null }>(
            `SELECT DISTINCT p.id, p.name, p.tenant_id
             FROM programs p
             WHERE EXISTS (
               SELECT 1 FROM (
                 SELECT channel_id, program_id FROM station_schedule_rules
                 UNION
                 SELECT channel_id, program_id FROM station_program_slots
               ) bindings
               WHERE bindings.program_id = p.id AND bindings.channel_id = ANY($1)
             )
             ORDER BY p.id`,
            [auth.scope.channelIds],
          ),
    ]);
    const body: AdminMetaDto = {
      stations: stations.rows,
      programs: programs.rows.map((row) => ({ id: row.id, name: row.name, tenantId: row.tenant_id })),
    };
    return json(body);
  } catch (error) {
    return adminErrorResponse(error);
  }
}
