import { requireAdmin } from "../../../../lib/admin/auth";
import { appDb, centralDb } from "../../../../lib/admin/db";
import { adminEnv } from "../../../../lib/admin/env";
import { adminErrorResponse, badRequest, json } from "../../../../lib/admin/http";
import type { AdminChannelDto } from "../../../../lib/admin/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChannelRow {
  id: string;
  name: string;
  created_at: Date;
}

interface CheckpointRow {
  channel_id: string;
  desired: string;
  mode: string;
  slot_key: string | null;
  session_id: string | null;
  updated_at: Date;
}

interface BindingRow {
  channel_id: string;
  station_id: string | null;
  program_id: string;
}

interface NextSlotRow {
  channel_id: string;
  starts_at: Date;
  ends_at: Date;
  metadata: { title?: string } | null;
}

/**
 * Channels from the app DB, joined with production state (app DB) and the
 * central binding + next upcoming slot (central DB). Central enrichment is
 * best-effort: an unconfigured/unreachable central DB must not hide the app
 * channels an operator came to edit.
 */
export async function GET(request: Request): Promise<Response> {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const app = appDb();
    const [channels, checkpoints] = await Promise.all([
      app.query<ChannelRow>("SELECT id, name, created_at FROM channels ORDER BY id"),
      app.query<CheckpointRow>(
        "SELECT channel_id, desired, mode, slot_key, session_id, updated_at FROM production_checkpoints",
      ),
    ]);

    const bindings = new Map<string, BindingRow>();
    const nextByChannel = new Map<string, NextSlotRow>();
    if (adminEnv().centralDatabaseUrl) {
      try {
        const central = centralDb();
        const [bindingRows, nextRows] = await Promise.all([
          central.query<BindingRow>(
            `SELECT DISTINCT channel_id, station_id, program_id FROM (
               SELECT channel_id, station_id, program_id FROM station_schedule_rules
               UNION
               SELECT channel_id, station_id, program_id FROM station_program_slots
             ) bindings`,
          ),
          central.query<NextSlotRow>(
            `SELECT DISTINCT ON (channel_id) channel_id, starts_at, ends_at, metadata
             FROM station_program_slots
             WHERE starts_at > now() AND status IN ('scheduled', 'live')
             ORDER BY channel_id, starts_at`,
          ),
        ]);
        for (const row of bindingRows.rows) bindings.set(row.channel_id, row);
        for (const row of nextRows.rows) nextByChannel.set(row.channel_id, row);
      } catch (error) {
        console.error("[admin] central enrichment failed; returning app channels only:", error);
      }
    }

    const checkpointsByChannel = new Map(checkpoints.rows.map((row) => [row.channel_id, row]));
    const body: AdminChannelDto[] = channels.rows.map((channel) => {
      const checkpoint = checkpointsByChannel.get(channel.id);
      const binding = bindings.get(channel.id);
      const next = nextByChannel.get(channel.id);
      return {
        id: channel.id,
        name: channel.name,
        createdAt: channel.created_at.toISOString(),
        production: checkpoint
          ? {
              desired: checkpoint.desired,
              mode: checkpoint.mode,
              slotKey: checkpoint.slot_key,
              sessionId: checkpoint.session_id,
              updatedAt: checkpoint.updated_at.toISOString(),
            }
          : null,
        stationId: binding?.station_id ?? null,
        programId: binding?.program_id ?? null,
        nextSession: next
          ? {
              startsAt: next.starts_at.toISOString(),
              endsAt: next.ends_at.toISOString(),
              title: next.metadata?.title ?? null,
            }
          : null,
      };
    });
    return json(body);
  } catch (error) {
    return adminErrorResponse(error);
  }
}

const CHANNEL_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Create an app-DB channel row. */
export async function POST(request: Request): Promise<Response> {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!CHANNEL_ID_RE.test(id)) {
      throw badRequest("id must be 1-64 chars of lowercase letters, digits, and hyphens");
    }
    if (!name) throw badRequest("name is required");

    const client = await appDb().connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query<ChannelRow>(
        "INSERT INTO channels (id, name) VALUES ($1, $2) RETURNING id, name, created_at",
        [id, name],
      );
      await client.query(
        `INSERT INTO production_checkpoints (channel_id, desired, mode)
         VALUES ($1, 'stopped', 'stopped') ON CONFLICT (channel_id) DO NOTHING`,
        [id],
      );
      await client.query("COMMIT");
      const row = inserted.rows[0];
      return json(
        {
          id: row.id,
          name: row.name,
          createdAt: row.created_at.toISOString(),
          production: {
            desired: "stopped",
            mode: "stopped",
            slotKey: null,
            sessionId: null,
            updatedAt: row.created_at.toISOString(),
          },
          stationId: null,
          programId: null,
          nextSession: null,
        } satisfies AdminChannelDto,
        201,
      );
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if ((error as { code?: string }).code === "23505") {
        throw badRequest(`Channel ${id} already exists`);
      }
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return adminErrorResponse(error);
  }
}
