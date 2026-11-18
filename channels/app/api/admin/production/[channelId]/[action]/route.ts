import { authenticateAdmin } from "../../../../../../lib/admin/auth";
import { adminErrorResponse, badRequest, json, notFound, serviceUnavailable } from "../../../../../../lib/admin/http";
import { resolveControlToken } from "../../../../../../lib/admin/production";
import { assertChannelInScope } from "../../../../../../lib/admin/scope";
import { getChannelApps } from "../../../../../../lib/channel-apps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Actions an admin may forward to a registered app's production-control surface. */
const ALLOWED_ACTIONS = new Set(["start", "stop", "test-closing"]);

const APP_FETCH_TIMEOUT_MS = 10_000;

/**
 * Proxy `POST /api/production/:action` to the app registered on `channelId`.
 * The channel resolves to its registered origin (central `programs.app_origin`
 * or the env fallbacks) and the control credential comes from the central
 * `channel_app_control_tokens` table (bears keeps its env token as fallback).
 * The control token stays server-side — the browser only ever holds the
 * operator's admin token.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ channelId: string; action: string }> },
): Promise<Response> {
  const auth = await authenticateAdmin(request);
  if (!auth.ok) return auth.response;
  try {
    const { channelId, action } = await context.params;
    if (!ALLOWED_ACTIONS.has(action)) {
      throw badRequest(`Unknown production action: ${action}`);
    }
    assertChannelInScope(auth.scope, channelId);

    const app = (await getChannelApps()).get(channelId);
    if (!app) throw notFound(`No registered app for channel ${channelId}`);

    const controlToken = await resolveControlToken(channelId);
    if (!controlToken) {
      throw serviceUnavailable(`Production control is not configured for channel ${channelId}`);
    }

    const response = await fetch(new URL(`/api/production/${action}`, app.origin), {
      method: "POST",
      headers: { Authorization: `Bearer ${controlToken}` },
      signal: AbortSignal.timeout(APP_FETCH_TIMEOUT_MS),
    });
    const body = await response.json().catch(() => null);
    return json(body ?? { status: response.statusText }, response.status);
  } catch (error) {
    return adminErrorResponse(error);
  }
}
