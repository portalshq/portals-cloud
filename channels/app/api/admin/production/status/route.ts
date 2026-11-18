import { authenticateAdmin } from "../../../../../lib/admin/auth";
import { appDb } from "../../../../../lib/admin/db";
import { adminEnv } from "../../../../../lib/admin/env";
import { adminErrorResponse, json } from "../../../../../lib/admin/http";
import { resolveControlToken } from "../../../../../lib/admin/production";
import { channelInScope } from "../../../../../lib/admin/scope";
import type { ProductionAppStatusDto, ProductionCheckpointDto, ProductionStatusDto } from "../../../../../lib/admin/types";
import { getChannelApps } from "../../../../../lib/channel-apps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_FETCH_TIMEOUT_MS = 5_000;

async function fetchApp(path: string, origin: string): Promise<unknown> {
  try {
    const response = await fetch(new URL(path, origin), {
      signal: AbortSignal.timeout(APP_FETCH_TIMEOUT_MS),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "app API unreachable" };
  }
}

/**
 * Production state for every registered app within the token's scope: the
 * configured app database's desired/mode checkpoints (when an app database
 * is configured) plus a live health and channel read per app. App reads are
 * reported as data (never thrown) so an unreachable app still shows DB state.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await authenticateAdmin(request);
  if (!auth.ok) return auth.response;
  try {
    const registryApps = [...(await getChannelApps()).entries()]
      .filter(([channelId]) => channelInScope(auth.scope, channelId))
      .map(([channelId, app]) => ({ channelId, origin: app.origin }));

    let checkpoints: ProductionCheckpointDto[] = [];
    if (adminEnv().appDatabaseUrl) {
      try {
        const rows = await appDb().query<{
          channel_id: string;
          desired: string;
          mode: string;
          slot_key: string | null;
          session_id: string | null;
          updated_at: Date;
        }>(
          "SELECT channel_id, desired, mode, slot_key, session_id, updated_at FROM production_checkpoints ORDER BY channel_id",
        );
        checkpoints = rows.rows.map((row) => ({
          channelId: row.channel_id,
          desired: row.desired,
          mode: row.mode,
          slotKey: row.slot_key,
          sessionId: row.session_id,
          updatedAt: row.updated_at.toISOString(),
        }));
      } catch (error) {
        console.error("[admin] checkpoint read failed; returning app statuses only:", error);
      }
    }

    const apps: ProductionAppStatusDto[] = await Promise.all(
      registryApps.map(async (app): Promise<ProductionAppStatusDto> => ({
        channelId: app.channelId,
        origin: app.origin,
        controlConfigured: (await resolveControlToken(app.channelId)) !== null,
        health: await fetchApp("/api/health", app.origin),
        channel: await fetchApp("/api/channel", app.origin),
      })),
    );

    const body: ProductionStatusDto = { checkpoints, apps };
    return json(body);
  } catch (error) {
    return adminErrorResponse(error);
  }
}
