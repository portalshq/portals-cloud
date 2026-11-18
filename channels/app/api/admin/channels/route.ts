import { authenticateAdmin } from "../../../../lib/admin/auth";
import { appDb, centralDb } from "../../../../lib/admin/db";
import { adminEnv } from "../../../../lib/admin/env";
import { adminErrorResponse, json } from "../../../../lib/admin/http";
import { channelInScope } from "../../../../lib/admin/scope";
import type { AdminChannelDto } from "../../../../lib/admin/types";
import { getChannelApps } from "../../../../lib/channel-apps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BindingRow {
  channel_id: string;
  station_id: string | null;
  program_id: string;
  program_name: string;
  description: string | null;
  tagline: string | null;
}

interface NextSlotRow {
  channel_id: string;
  starts_at: Date;
  ends_at: Date;
  metadata: { title?: string } | null;
}

interface CheckpointRow {
  channel_id: string;
  desired: string;
  mode: string;
  slot_key: string | null;
  session_id: string | null;
  updated_at: Date;
}

/**
 * Channel list for the admin — driven by the central database and the channel
 * app registry (central `programs.app_origin` plus the env fallbacks), not by
 * any single app's database. A channel appears when it has a station/program
 * binding (rules or slots) or a registered app. The configured app database
 * is optional enrichment: its `production_checkpoints` are merged in when
 * available, never required.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await authenticateAdmin(request);
  if (!auth.ok) return auth.response;
  try {
    const central = centralDb();
    const [bindingRows, nextRows, registryApps] = await Promise.all([
      central.query<BindingRow>(
        `SELECT DISTINCT b.channel_id, b.station_id, b.program_id, p.name AS program_name,
                p.description, p.tagline
         FROM (
           SELECT channel_id, station_id, program_id FROM station_schedule_rules
           UNION
           SELECT channel_id, station_id, program_id FROM station_program_slots
         ) b
         JOIN programs p ON p.id = b.program_id
         ORDER BY b.channel_id, b.program_id, b.station_id NULLS LAST`,
      ),
      central.query<NextSlotRow>(
        `SELECT DISTINCT ON (channel_id) channel_id, starts_at, ends_at, metadata
         FROM station_program_slots
         WHERE starts_at > now() AND status IN ('scheduled', 'live')
         ORDER BY channel_id, starts_at`,
      ),
      getChannelApps(),
    ]);

    // Checkpoints live in each app's own database; only the configured app
    // database is reachable. Best-effort enrichment — a channel whose app
    // owns its checkpoints elsewhere still lists fine.
    let checkpoints = new Map<string, CheckpointRow>();
    if (adminEnv().appDatabaseUrl) {
      try {
        const { rows } = await appDb().query<CheckpointRow>(
          "SELECT channel_id, desired, mode, slot_key, session_id, updated_at FROM production_checkpoints",
        );
        checkpoints = new Map(rows.map((row) => [row.channel_id, row]));
      } catch (error) {
        console.error("[admin] checkpoint enrichment failed; returning central channels only:", error);
      }
    }

    const bindingsByChannel = new Map<string, BindingRow[]>();
    for (const row of bindingRows.rows) {
      const bindings = bindingsByChannel.get(row.channel_id) ?? [];
      bindings.push(row);
      bindingsByChannel.set(row.channel_id, bindings);
    }
    const nextByChannel = new Map(nextRows.rows.map((row) => [row.channel_id, row]));

    // Every channel with a binding or a registered app, within the token's scope.
    const channelIds = new Set<string>([...bindingsByChannel.keys(), ...registryApps.keys()]);
    const body: AdminChannelDto[] = [...channelIds]
      .filter((channelId) => channelInScope(auth.scope, channelId))
      .sort()
      .map((channelId): AdminChannelDto => {
        const bindings = bindingsByChannel.get(channelId) ?? [];
        const registryApp = registryApps.get(channelId);
        const programs = [
          ...new Map(
            bindings.map((row) => [
              row.program_id,
              {
                id: row.program_id,
                name: row.program_name ?? row.program_id,
                description: row.description,
                tagline: row.tagline,
              },
            ]),
          ).values(),
        ];
        const checkpoint = checkpoints.get(channelId);
        const next = nextByChannel.get(channelId);
        return {
          id: channelId,
          name: registryApp?.name ?? programs[0]?.name ?? channelId,
          app: registryApp ? { origin: registryApp.origin, name: registryApp.name } : null,
          bindings: bindings.map((row) => ({ stationId: row.station_id, programId: row.program_id })),
          programs,
          production: checkpoint
            ? {
                desired: checkpoint.desired,
                mode: checkpoint.mode,
                slotKey: checkpoint.slot_key,
                sessionId: checkpoint.session_id,
                updatedAt: checkpoint.updated_at.toISOString(),
              }
            : null,
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
