import { updateProgramPromotionalCopy } from "@portalshq/channel-registry";
import { requireAdmin } from "../../../../../lib/admin/auth";
import { centralDb } from "../../../../../lib/admin/db";
import { adminErrorResponse, badRequest, json, notFound } from "../../../../../lib/admin/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.description !== "string" || typeof body.tagline !== "string") {
      throw badRequest("description and tagline must be strings");
    }
    const pool = centralDb();
    const result = await updateProgramPromotionalCopy((sql, values) => pool.query(sql, values), id, {
      description: body.description.trim(),
      tagline: body.tagline.trim(),
    });
    if (!result) throw notFound("Program not found");
    return json({ id, description: result.description, tagline: result.tagline });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
