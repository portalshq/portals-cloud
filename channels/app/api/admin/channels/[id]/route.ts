import { requireAdmin } from "../../../../../lib/admin/auth";
import { appDb } from "../../../../../lib/admin/db";
import { adminErrorResponse, badRequest, json, notFound } from "../../../../../lib/admin/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChannelRow {
  id: string;
  name: string;
  created_at: Date;
}

/** Rename a channel. The id is a primary key referenced everywhere — immutable. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) throw badRequest("name is required");

    const result = await appDb().query<ChannelRow>(
      "UPDATE channels SET name = $2 WHERE id = $1 RETURNING id, name, created_at",
      [id, name],
    );
    if (!result.rows.length) throw notFound("Channel not found");
    const row = result.rows[0];
    return json({ id: row.id, name: row.name, createdAt: row.created_at.toISOString() });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
