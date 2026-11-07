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
  name: string
  createdAt: string
  production: {
    desired: string
    mode: string
    slotKey: string | null
    sessionId: string | null
    updatedAt: string
  } | null
  stationId: string | null
  programId: string | null
  nextSession: { startsAt: string; endsAt: string; title: string | null } | null
}

export interface AdminMeta {
  stations: { id: string; name: string }[]
  programs: { id: string; name: string; tenantId: string | null }[]
}

export interface AdminInfo {
  version: string
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

export interface ProductionStatus {
  checkpoints: ProductionCheckpoint[]
  bearsHealth: unknown
  bearsChannel: unknown
}
