import { requireAdmin } from "../../../../../lib/admin/auth";
import { appDb } from "../../../../../lib/admin/db";
import { adminEnv } from "../../../../../lib/admin/env";
import { adminErrorResponse, json } from "../../../../../lib/admin/http";
import type { ProductionCheckpointDto, ProductionStatusDto } from "../../../../../lib/admin/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BEARS_FETCH_TIMEOUT_MS = 5_000;

async function fetchBears(path: string): Promise<unknown> {
  const { bearsApiBaseUrl } = adminEnv();
  if (!bearsApiBaseUrl) return { error: "bears API is not configured" };
  try {
    const response = await fetch(`${bearsApiBaseUrl}${path}`, {
      signal: AbortSignal.timeout(BEARS_FETCH_TIMEOUT_MS),
    });
    const body = await response.json().catch(() => null);
    return { status: response.status, body };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "bears API unreachable" };
  }
}

/**
 * Production state: the app DB's desired/mode checkpoints plus a live read of
 * the bears server's health and channel endpoints. Bears reads are reported
 * as data (never thrown) so an unreachable bears server still shows DB state.
 */
export async function GET(request: Request): Promise<Response> {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const checkpoints = await appDb().query<{
      channel_id: string;
      desired: string;
      mode: string;
      slot_key: string | null;
      session_id: string | null;
      updated_at: Date;
    }>(
      "SELECT channel_id, desired, mode, slot_key, session_id, updated_at FROM production_checkpoints ORDER BY channel_id",
    );
    const [bearsHealth, bearsChannel] = await Promise.all([
      fetchBears("/api/health"),
      fetchBears("/api/channel"),
    ]);
    const body: ProductionStatusDto = {
      checkpoints: checkpoints.rows.map(
        (row): ProductionCheckpointDto => ({
          channelId: row.channel_id,
          desired: row.desired,
          mode: row.mode,
          slotKey: row.slot_key,
          sessionId: row.session_id,
          updatedAt: row.updated_at.toISOString(),
        }),
      ),
      bearsHealth,
      bearsChannel,
    };
    return json(body);
  } catch (error) {
    return adminErrorResponse(error);
  }
}
