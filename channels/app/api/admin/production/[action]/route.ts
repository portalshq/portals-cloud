import { requireAdmin } from "../../../../../lib/admin/auth";
import { adminEnv } from "../../../../../lib/admin/env";
import { adminErrorResponse, badRequest, json, serviceUnavailable } from "../../../../../lib/admin/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Actions the admin may forward to bears' production-control surface. */
const ALLOWED_ACTIONS = new Set(["start", "stop", "test-closing"]);

const BEARS_FETCH_TIMEOUT_MS = 10_000;

/**
 * Proxy to bears `POST /api/production/:action`. The production-control token
 * stays server-side — the browser only ever holds the admin token.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
): Promise<Response> {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const { action } = await context.params;
    if (!ALLOWED_ACTIONS.has(action)) {
      throw badRequest(`Unknown production action: ${action}`);
    }
    const { bearsApiBaseUrl, bearsProductionControlToken } = adminEnv();
    if (!bearsApiBaseUrl || !bearsProductionControlToken) {
      throw serviceUnavailable("Bears production control is not configured");
    }

    const response = await fetch(`${bearsApiBaseUrl}/api/production/${action}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${bearsProductionControlToken}` },
      signal: AbortSignal.timeout(BEARS_FETCH_TIMEOUT_MS),
    });
    const body = await response.json().catch(() => null);
    return json(body ?? { status: response.statusText }, response.status);
  } catch (error) {
    return adminErrorResponse(error);
  }
}
