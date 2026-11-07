import { randomUUID } from "node:crypto";
import { requireAdmin } from "../../../../lib/admin/auth";
import { centralDb } from "../../../../lib/admin/db";
import { adminErrorResponse, badRequest, json } from "../../../../lib/admin/http";
import { parseScheduleConfig, type ScheduleConfig } from "../../../../lib/admin/schedule";
import type { ScheduleRuleDto } from "../../../../lib/admin/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RuleRow {
  id: string;
  station_id: string | null;
  program_id: string;
  channel_id: string;
  schedule: ScheduleConfig;
  enabled: boolean;
  next_run_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export function toScheduleRuleDto(row: RuleRow): ScheduleRuleDto {
  return {
    id: row.id,
    stationId: row.station_id,
    programId: row.program_id,
    channelId: row.channel_id,
    schedule: row.schedule,
    enabled: row.enabled,
    nextRunAt: row.next_run_at ? row.next_run_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function GET(request: Request): Promise<Response> {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const url = new URL(request.url);
    const clauses: string[] = [];
    const values: string[] = [];
    for (const [param, column] of [
      ["channelId", "channel_id"],
      ["stationId", "station_id"],
      ["programId", "program_id"],
    ] as const) {
      const value = url.searchParams.get(param);
      if (value) {
        values.push(value);
        clauses.push(`${column} = $${values.length}`);
      }
    }
    if (url.searchParams.get("enabled") === "false") clauses.push("enabled = false");
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await centralDb().query<RuleRow>(
      `SELECT id, station_id, program_id, channel_id, schedule, enabled, next_run_at, created_at, updated_at
       FROM station_schedule_rules ${where} ORDER BY channel_id, id`,
      values,
    );
    return json(result.rows.map(toScheduleRuleDto));
  } catch (error) {
    return adminErrorResponse(error);
  }
}

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
    const schedule = parseScheduleConfig(body.schedule);
    const enabled = body.enabled === undefined ? true : Boolean(body.enabled);

    const result = await centralDb().query<RuleRow>(
      `INSERT INTO station_schedule_rules (id, station_id, program_id, channel_id, schedule, enabled)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       RETURNING id, station_id, program_id, channel_id, schedule, enabled, next_run_at, created_at, updated_at`,
      [randomUUID(), stationId, programId, channelId, JSON.stringify(schedule), enabled],
    );
    return json(toScheduleRuleDto(result.rows[0]), 201);
  } catch (error) {
    return adminErrorResponse(error);
  }
}
