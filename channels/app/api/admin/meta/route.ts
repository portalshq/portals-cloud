import { requireAdmin } from "../../../../lib/admin/auth";
import { centralDb } from "../../../../lib/admin/db";
import { adminErrorResponse, json } from "../../../../lib/admin/http";
import type { AdminMetaDto } from "../../../../lib/admin/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Picklists for schedule/session create forms. */
export async function GET(request: Request): Promise<Response> {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const [stations, programs] = await Promise.all([
      centralDb().query<{ id: string; name: string }>("SELECT id, name FROM stations ORDER BY id"),
      centralDb().query<{ id: string; name: string; tenant_id: string | null }>(
        "SELECT id, name, tenant_id FROM programs ORDER BY id",
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
