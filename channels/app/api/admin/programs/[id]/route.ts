import { updateProgramDetails } from "@portalshq/channel-registry";
import { authenticateAdmin } from "../../../../../lib/admin/auth";
import { centralDb } from "../../../../../lib/admin/db";
import { adminErrorResponse, badRequest, json, notFound } from "../../../../../lib/admin/http";
import { assertProgramEditable } from "../../../../../lib/admin/scope";
import { invalidateCatalog } from "../../../../../lib/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Edit a program's public details: name, description, and/or tagline. Only
 * the superuser may edit a program that is not entirely inside the caller's
 * channel scope — program copy shows on every channel the program is bound to.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await authenticateAdmin(request);
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    const body = await request.json() as Record<string, unknown>;

    const patch: { name?: string; description?: string; tagline?: string } = {};
    if ("name" in body) {
      if (typeof body.name !== "string" || !body.name.trim()) throw badRequest("name must be a non-empty string");
      patch.name = body.name.trim();
    }
    if ("description" in body) {
      if (typeof body.description !== "string") throw badRequest("description must be a string");
      patch.description = body.description.trim();
    }
    if ("tagline" in body) {
      if (typeof body.tagline !== "string") throw badRequest("tagline must be a string");
      patch.tagline = body.tagline.trim();
    }
    if (!Object.keys(patch).length) throw badRequest("Provide name, description, or tagline");

    await assertProgramEditable(auth.scope, centralDb(), id);
    const pool = centralDb();
    const result = await updateProgramDetails((sql, values) => pool.query(sql, values), id, patch);
    if (!result) throw notFound("Program not found");
    invalidateCatalog();
    return json({ id, ...result });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
