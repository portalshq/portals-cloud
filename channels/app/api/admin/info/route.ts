import { requireAdmin } from "../../../../lib/admin/auth";
import { adminEnv } from "../../../../lib/admin/env";
import { appDb, centralDb } from "../../../../lib/admin/db";
import { json } from "../../../../lib/admin/http";
import type { AdminInfoDto } from "../../../../lib/admin/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function probe(configured: boolean, query: () => Promise<unknown>): Promise<boolean> {
  if (!configured) return false;
  try {
    await query();
    return true;
  } catch (error) {
    console.error("[admin] info probe failed:", error);
    return false;
  }
}

export async function GET(request: Request): Promise<Response> {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const env = adminEnv();
  const [appConnected, centralConnected] = await Promise.all([
    probe(Boolean(env.appDatabaseUrl), () => appDb().query("SELECT 1")),
    probe(Boolean(env.centralDatabaseUrl), () => centralDb().query("SELECT 1")),
  ]);

  const body: AdminInfoDto = {
    version: process.env.npm_package_version ?? "0.0.0",
    databases: {
      app: { configured: Boolean(env.appDatabaseUrl), connected: appConnected },
      central: { configured: Boolean(env.centralDatabaseUrl), connected: centralConnected },
    },
  };
  return json(body);
}
