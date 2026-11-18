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

/** A channel listed by GET /api/admin/channels — central-DB driven. */
export interface AdminChannelDto {
  id: string;
  /** Display name: registered app name, else first program name, else id. */
  name: string;
  /** Registered channel app (public origin + presentation name), when one exists. */
  app: { origin: string; name: string } | null;
  /** Distinct station/program bindings feeding this channel. */
  bindings: { stationId: string | null; programId: string }[];
  /** Distinct programs across bindings, for copy editing. */
  programs: { id: string; name: string; description: string | null; tagline: string | null }[];
  /**
   * production_checkpoints row from the configured app database, when one is
   * configured and the channel has been produced before. Best-effort: absent
   * for channels whose app owns its own checkpoints.
   */
  production: {
    desired: string;
    mode: string;
    slotKey: string | null;
    sessionId: string | null;
    updatedAt: string;
  } | null;
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
  /** Scope granted to the presented token. */
  scope: { allChannels: boolean; channelIds: string[] | null };
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

/** Live read of one registered app's production surface. */
export interface ProductionAppStatusDto {
  channelId: string;
  origin: string;
  /** Whether a production-control credential is configured for the app. */
  controlConfigured: boolean;
  /** GET /api/health — reported as data, never a request failure. */
  health: unknown;
  /** GET /api/channel — playback/session snapshot. */
  channel: unknown;
}

export interface ProductionStatusDto {
  checkpoints: ProductionCheckpointDto[];
  /** One entry per registered app within the token's scope. */
  apps: ProductionAppStatusDto[];
}
