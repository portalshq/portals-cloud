/**
 * Admin API DTOs — mirrors cloud/channels/lib/admin/types.ts (the route
 * handlers' contract). Keep the two in sync.
 */

export interface ScheduleConfig {
  scheduledDays?: string[]
  scheduledTime: string
  timezone: string
  episodeDurationMs: number
  ambientDurationMs: number
}

export interface ScheduleRule {
  id: string
  stationId: string | null
  programId: string
  channelId: string
  schedule: ScheduleConfig
  enabled: boolean
  nextRunAt: string | null
  createdAt: string
  updatedAt: string
}

export type SlotStatus = 'scheduled' | 'live' | 'completed' | 'cancelled'

export interface ProgramSlot {
  id: string
  stationId: string | null
  programId: string
  channelId: string
  startsAt: string
  endsAt: string
  status: string
  title: string | null
  createdAt: string
}

export interface AdminChannel {
  id: string
  /** Display name: registered app name, else first program name, else id. */
  name: string
  /** Registered channel app (public origin + name), when one exists. */
  app: { origin: string; name: string } | null
  /** Distinct station/program bindings feeding this channel. */
  bindings: { stationId: string | null; programId: string }[]
  /** Distinct programs across bindings, for copy editing. */
  programs: { id: string; name: string; description: string | null; tagline: string | null }[]
  /** production_checkpoints row from the configured app database, if any. */
  production: {
    desired: string
    mode: string
    slotKey: string | null
    sessionId: string | null
    updatedAt: string
  } | null
  nextSession: { startsAt: string; endsAt: string; title: string | null } | null
}

export interface AdminMeta {
  stations: { id: string; name: string }[]
  programs: { id: string; name: string; tenantId: string | null }[]
}

export interface AdminInfo {
  version: string
  /** Scope granted to the presented token. */
  scope: { allChannels: boolean; channelIds: string[] | null }
  databases: {
    app: { configured: boolean; connected: boolean }
    central: { configured: boolean; connected: boolean }
  }
}

export interface ProductionCheckpoint {
  channelId: string
  desired: string
  mode: string
  slotKey: string | null
  sessionId: string | null
  updatedAt: string
}

/** Live read of one registered app's production surface. */
export interface ProductionAppStatus {
  channelId: string
  origin: string
  /** Whether a production-control credential is configured for the app. */
  controlConfigured: boolean
  /** GET /api/health — reported as data, never a request failure. */
  health: unknown
  /** GET /api/channel — playback/session snapshot. */
  channel: unknown
}

export interface ProductionStatus {
  checkpoints: ProductionCheckpoint[]
  /** One entry per registered app within the token's scope. */
  apps: ProductionAppStatus[]
}
