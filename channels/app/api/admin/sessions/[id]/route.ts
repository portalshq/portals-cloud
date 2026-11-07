import { requireAdmin } from "../../../../../lib/admin/auth";
import { centralDb } from "../../../../../lib/admin/db";
import { adminErrorResponse, badRequest, json, notFound } from "../../../../../lib/admin/http";
import { SLOT_STATUSES, type ProgramSlotDto } from "../../../../../lib/admin/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SlotRow {
  id: string;
  station_id: string | null;
  program_id: string;
  channel_id: string;
  starts_at: Date;
  ends_at: Date;
  status: string;
  metadata: { title?: string } | null;
  created_at: Date;
}

function toDto(row: SlotRow): ProgramSlotDto {
  return {
    id: row.id,
    stationId: row.station_id,
    programId: row.program_id,
    channelId: row.channel_id,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    status: row.status,
    title: row.metadata?.title ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

function parseInstant(value: unknown, name: string): Date {
  if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) {
    throw badRequest(`${name} must be an ISO 8601 timestamp`);
  }
  return new Date(value);
}

/** Update a slot's window, status, or title. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;

    const current = await centralDb().query<SlotRow>(
      "SELECT id, starts_at, ends_at FROM station_program_slots WHERE id = $1",
      [id],
    );
    if (!current.rows.length) throw notFound("Session not found");

    const startsAt = "startsAt" in body ? parseInstant(body.startsAt, "startsAt") : current.rows[0].starts_at;
    const endsAt = "endsAt" in body ? parseInstant(body.endsAt, "endsAt") : current.rows[0].ends_at;
    if (endsAt <= startsAt) throw badRequest("endsAt must be after startsAt");

    const status = "status" in body ? body.status : undefined;
    if (status !== undefined && !(SLOT_STATUSES as readonly string[]).includes(status as string)) {
      throw badRequest(`status must be one of ${SLOT_STATUSES.join(", ")}`);
    }
    const hasTitle = "title" in body;
    if (hasTitle && body.title !== null && typeof body.title !== "string") {
      throw badRequest("title must be a string or null");
    }
    if (!("startsAt" in body) && !("endsAt" in body) && status === undefined && !hasTitle) {
      throw badRequest("Provide startsAt, endsAt, status, or title");
    }

    const result = await centralDb().query<SlotRow>(
      `UPDATE station_program_slots
       SET starts_at = $2,
           ends_at = $3,
           status = COALESCE($4, status),
           metadata = CASE WHEN $5 THEN $6::jsonb ELSE metadata END
       WHERE id = $1
       RETURNING id, station_id, program_id, channel_id, starts_at, ends_at, status, metadata, created_at`,
      [
        id,
        startsAt,
        endsAt,
        (status as string | undefined) ?? null,
        hasTitle,
        hasTitle && body.title !== null ? JSON.stringify({ title: body.title }) : null,
      ],
    );
    return json(toDto(result.rows[0]));
  } catch (error) {
    return adminErrorResponse(error);
  }
}
