/**
 * Admin API DTOs. Database rows stay snake_case; these are the camelCase
 * shapes the admin SPA consumes.
 */

import type { ScheduleConfig } from "./schedule";

/** station_schedule_rules row. */
export interface ScheduleRuleDto {
  id: string;
  stationId: string | null;
  programId: string;
  channelId: string;
  schedule: ScheduleConfig;
  enabled: boolean;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** station_program_slots row — a materialized session window. */
export interface ProgramSlotDto {
  id: string;
  stationId: string | null;
  programId: string;
  channelId: string;
  startsAt: string;
  endsAt: string;
  status: string;
  /** Pulled from metadata.title; null when the slot carries no title. */
  title: string | null;
  createdAt: string;
}

export const SLOT_STATUSES = ["scheduled", "live", "completed", "cancelled"] as const;
export type SlotStatus = (typeof SLOT_STATUSES)[number];

/** App-DB channels row joined with production + central binding info. */
export interface AdminChannelDto {
  id: string;
  name: string;
  createdAt: string;
  /** production_checkpoints row, when the channel has been produced before. */
  production: {
    desired: string;
    mode: string;
    slotKey: string | null;
    sessionId: string | null;
    updatedAt: string;
  } | null;
  /** Station/program this channel's rules and slots are bound to. */
  stationId: string | null;
  programId: string | null;
  /** Earliest future scheduled/live slot for this channel, if any. */
  nextSession: { startsAt: string; endsAt: string; title: string | null } | null;
}

/** GET /api/admin/meta — picklists for create forms. */
export interface AdminMetaDto {
  stations: { id: string; name: string }[];
  programs: { id: string; name: string; tenantId: string | null }[];
}

export interface AdminInfoDto {
  version: string;
  databases: {
    app: { configured: boolean; connected: boolean };
    central: { configured: boolean; connected: boolean };
  };
}

/** production_checkpoints row. */
export interface ProductionCheckpointDto {
  channelId: string;
  desired: string;
  mode: string;
  slotKey: string | null;
  sessionId: string | null;
  updatedAt: string;
}

export interface ProductionStatusDto {
  checkpoints: ProductionCheckpointDto[];
  bearsHealth: unknown;
  bearsChannel: unknown;
}
