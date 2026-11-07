import { requireAdmin } from "../../../../../lib/admin/auth";
import { centralDb } from "../../../../../lib/admin/db";
import { adminErrorResponse, badRequest, json, notFound } from "../../../../../lib/admin/http";
import { mergeSchedulePatch, type ScheduleConfig } from "../../../../../lib/admin/schedule";
import type { ScheduleRuleDto } from "../../../../../lib/admin/types";

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

const RETURNING =
  "RETURNING id, station_id, program_id, channel_id, schedule, enabled, next_run_at, created_at, updated_at";

function toDto(row: RuleRow): ScheduleRuleDto {
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

/**
 * Edit a recurrence rule. Schedule JSONB fields merge onto the existing rule;
 * `next_run_at` is always reset to NULL so the next slot-scheduler tick (~30s
 * on the production leader) recomputes occurrences — this is the revision
 * path documented in docs/SCHEDULING.md.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;

    const current = await centralDb().query<RuleRow>(
      "SELECT id, schedule FROM station_schedule_rules WHERE id = $1",
      [id],
    );
    if (!current.rows.length) throw notFound("Schedule not found");

    const hasSchedulePatch = "schedule" in body;
    const hasEnabledPatch = "enabled" in body;
    if (!hasSchedulePatch && !hasEnabledPatch) {
      throw badRequest("Provide schedule and/or enabled");
    }

    const schedule = hasSchedulePatch
      ? mergeSchedulePatch(current.rows[0].schedule, body.schedule)
      : current.rows[0].schedule;
    const enabled = hasEnabledPatch ? Boolean(body.enabled) : undefined;

    const result = await centralDb().query<RuleRow>(
      `UPDATE station_schedule_rules
       SET schedule = $2::jsonb,
           enabled = COALESCE($3, enabled),
           next_run_at = NULL,
           updated_at = now()
       WHERE id = $1 ${RETURNING}`,
      [id, JSON.stringify(schedule), enabled ?? null],
    );
    return json(toDto(result.rows[0]));
  } catch (error) {
    return adminErrorResponse(error);
  }
}

/** Soft delete: rules are disabled, never removed — the scheduler skips them. */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await context.params;
    const result = await centralDb().query<RuleRow>(
      `UPDATE station_schedule_rules SET enabled = false, next_run_at = NULL, updated_at = now()
       WHERE id = $1 ${RETURNING}`,
      [id],
    );
    if (!result.rows.length) throw notFound("Schedule not found");
    return json(toDto(result.rows[0]));
  } catch (error) {
    return adminErrorResponse(error);
  }
}
