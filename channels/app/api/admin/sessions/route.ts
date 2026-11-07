import { randomUUID } from "node:crypto";
import { requireAdmin } from "../../../../lib/admin/auth";
import { centralDb } from "../../../../lib/admin/db";
import { adminErrorResponse, badRequest, json } from "../../../../lib/admin/http";
import { SLOT_STATUSES, type ProgramSlotDto, type SlotStatus } from "../../../../lib/admin/types";

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

export function toProgramSlotDto(row: SlotRow): ProgramSlotDto {
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

export async function GET(request: Request): Promise<Response> {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const url = new URL(request.url);
    const clauses: string[] = [];
    const values: unknown[] = [];
    const add = (column: string, value: string) => {
      values.push(value);
      clauses.push(`${column} = $${values.length}`);
    };
    const channelId = url.searchParams.get("channelId");
    const stationId = url.searchParams.get("stationId");
    const programId = url.searchParams.get("programId");
    const status = url.searchParams.get("status");
    if (channelId) add("channel_id", channelId);
    if (stationId) add("station_id", stationId);
    if (programId) add("program_id", programId);
    if (status) {
      if (!(SLOT_STATUSES as readonly string[]).includes(status)) {
        throw badRequest(`status must be one of ${SLOT_STATUSES.join(", ")}`);
      }
      add("status", status);
    }
    // Default scope is upcoming/active windows; ?scope=all lists history too.
    if (url.searchParams.get("scope") !== "all") clauses.push("ends_at > now()");
    const limitParam = Number.parseInt(url.searchParams.get("limit") ?? "200", 10);
    const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 1000) : 200;
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await centralDb().query<SlotRow>(
      `SELECT id, station_id, program_id, channel_id, starts_at, ends_at, status, metadata, created_at
       FROM station_program_slots ${where} ORDER BY starts_at, id LIMIT ${limit}`,
      values,
    );
    return json(result.rows.map(toProgramSlotDto));
  } catch (error) {
    return adminErrorResponse(error);
  }
}

/**
 * Insert a one-off slot (the documented path for ad-hoc windows). The
 * unique (station_id, program_id, starts_at) constraint protects against
 * duplicates; a conflict reports 409 rather than silently no-oping.
 */
export async function POST(request: Request): Promise<Response> {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const stationId = typeof body.stationId === "string" && body.stationId ? body.stationId : null;
    const programId = typeof body.programId === "string" ? body.programId : null;
    const channelId = typeof body.channelId === "string" ? body.channelId : null;
    if (!programId) throw badRequest("programId is required");
    if (!channelId) throw badRequest("channelId is required");
    const startsAt = parseInstant(body.startsAt, "startsAt");
    const endsAt = parseInstant(body.endsAt, "endsAt");
    if (endsAt <= startsAt) throw badRequest("endsAt must be after startsAt");
    const status = (body.status as SlotStatus | undefined) ?? "scheduled";
    if (!(SLOT_STATUSES as readonly string[]).includes(status)) {
      throw badRequest(`status must be one of ${SLOT_STATUSES.join(", ")}`);
    }
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : null;
    const metadata = title ? JSON.stringify({ title }) : null;

    const result = await centralDb().query<SlotRow>(
      `INSERT INTO station_program_slots (id, station_id, program_id, channel_id, starts_at, ends_at, status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       ON CONFLICT (station_id, program_id, starts_at) DO NOTHING
       RETURNING id, station_id, program_id, channel_id, starts_at, ends_at, status, metadata, created_at`,
      [randomUUID(), stationId, programId, channelId, startsAt, endsAt, status, metadata],
    );
    if (!result.rows.length) {
      return json({ message: "A slot already exists for this station/program at startsAt" }, 409);
    }
    return json(toProgramSlotDto(result.rows[0]), 201);
  } catch (error) {
    return adminErrorResponse(error);
  }
}
