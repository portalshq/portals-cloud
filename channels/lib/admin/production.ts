/**
 * Per-app production-control credentials for the admin production proxy.
 *
 * The control token forwarded to a registered app's POST /api/production/*
 * comes from the central `channel_app_control_tokens` table (database-driven
 * by default). The env `BEARS_PRODUCTION_CONTROL_TOKEN` remains as a fallback
 * for the legacy bears deployment. The token never reaches the browser.
 */

import { centralDb } from "./db";
import { adminEnv } from "./env";

/** Legacy env fallback applies only to the bears channel. */
function envControlTokenFallback(channelId: string): string | null {
  return channelId === "bears" ? adminEnv().bearsProductionControlToken : null;
}

/**
 * Resolves the server-side bearer for `POST /api/production/*` on the app
 * registered for `channelId`. Returns null when no credential is configured —
 * the caller turns that into a 503, never a forwarded unauthenticated call.
 */
export async function resolveControlToken(channelId: string): Promise<string | null> {
  if (adminEnv().centralDatabaseUrl) {
    try {
      const { rows } = await centralDb().query<{ control_token: string }>(
        "SELECT control_token FROM channel_app_control_tokens WHERE channel_id = $1",
        [channelId],
      );
      if (rows[0]?.control_token) return rows[0].control_token;
    } catch (error) {
      console.error("[admin] channel_app_control_tokens lookup failed:", error);
    }
  }
  return envControlTokenFallback(channelId);
}
