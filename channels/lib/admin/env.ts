/**
 * Environment configuration for the admin API.
 *
 * Every accessor is lazy and returns null when unset rather than throwing at
 * import time — a missing env is a per-request 503, never a module-load crash.
 */

export interface AdminEnv {
  /** Bearer token guarding /api/admin/*. */
  adminToken: string | null;
  /** Bears app database (channels, program_sessions, production_checkpoints). */
  appDatabaseUrl: string | null;
  /** Central platform database (station_schedule_rules, station_program_slots, …). */
  centralDatabaseUrl: string | null;
  /** Bears server origin used for production-control proxying and status reads. */
  bearsApiBaseUrl: string | null;
  /** Server-only bearer forwarded to bears /api/production/*. */
  bearsProductionControlToken: string | null;
}

export function adminEnv(): AdminEnv {
  return {
    adminToken: process.env.CHANNELS_ADMIN_TOKEN?.trim() || null,
    appDatabaseUrl: process.env.ADMIN_APP_DATABASE_URL?.trim() || null,
    centralDatabaseUrl: process.env.ADMIN_CENTRAL_DATABASE_URL?.trim() || null,
    bearsApiBaseUrl: process.env.BEARS_API_BASE_URL?.trim().replace(/\/+$/, "") || null,
    bearsProductionControlToken: process.env.BEARS_PRODUCTION_CONTROL_TOKEN?.trim() || null,
  };
}
