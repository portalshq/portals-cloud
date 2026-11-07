/**
 * ScheduleConfig validation — the JSONB `schedule` column of
 * station_schedule_rules. Field semantics mirror bears-live-app's
 * server/schedule.ts (`computeNextWindowForDate`); the same rules are
 * enforced here so the admin can never write a rule the scheduler rejects.
 */

import { badRequest } from "./http";

export interface ScheduleConfig {
  /** Days of week episodes run; empty/omitted means every day. */
  scheduledDays?: string[];
  /** 24h HH:MM in `timezone`. */
  scheduledTime: string;
  /** IANA timezone, e.g. "America/Denver". */
  timezone: string;
  episodeDurationMs: number;
  ambientDurationMs: number;
}

export const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function validateDays(days: unknown, required: boolean): string[] | undefined {
  if (days === undefined || days === null) {
    if (required) throw badRequest("scheduledDays must be an array of weekday names");
    return undefined;
  }
  if (!Array.isArray(days) || days.some((day) => typeof day !== "string")) {
    throw badRequest("scheduledDays must be an array of weekday names");
  }
  const lowered = days.map((day) => day.toLowerCase());
  const invalid = lowered.find((day) => !(WEEKDAYS as readonly string[]).includes(day));
  if (invalid) {
    throw badRequest(`Invalid scheduled day: ${invalid}`);
  }
  return lowered;
}

function validateTime(value: unknown, required: boolean): string | undefined {
  if (value === undefined || value === null) {
    if (required) throw badRequest("scheduledTime is required (HH:MM, 24h)");
    return undefined;
  }
  if (typeof value !== "string" || !TIME_RE.test(value)) {
    throw badRequest("scheduledTime must be HH:MM in 24h format");
  }
  return value;
}

function validateTimezone(value: unknown, required: boolean): string | undefined {
  if (value === undefined || value === null) {
    if (required) throw badRequest("timezone is required (IANA name)");
    return undefined;
  }
  if (typeof value !== "string" || !isValidTimeZone(value)) {
    throw badRequest(`Invalid IANA timezone: ${String(value)}`);
  }
  return value;
}

function validateDuration(value: unknown, name: string, required: boolean): number | undefined {
  if (value === undefined || value === null) {
    if (required) throw badRequest(`${name} is required (milliseconds)`);
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw badRequest(`${name} must be a positive integer number of milliseconds`);
  }
  return value;
}

/** Validate a complete ScheduleConfig for rule creation. */
export function parseScheduleConfig(input: unknown): ScheduleConfig {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw badRequest("schedule must be an object");
  }
  const body = input as Record<string, unknown>;
  return {
    scheduledDays: validateDays(body.scheduledDays, false),
    scheduledTime: validateTime(body.scheduledTime, true)!,
    timezone: validateTimezone(body.timezone, true)!,
    episodeDurationMs: validateDuration(body.episodeDurationMs, "episodeDurationMs", true)!,
    ambientDurationMs: validateDuration(body.ambientDurationMs, "ambientDurationMs", true)!,
  };
}

/**
 * Validate a partial schedule update and merge it onto an existing config.
 * Every field is optional; at least one recognized field must be present.
 */
export function mergeSchedulePatch(existing: ScheduleConfig, input: unknown): ScheduleConfig {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw badRequest("schedule patch must be an object");
  }
  const body = input as Record<string, unknown>;
  const merged: ScheduleConfig = { ...existing };
  let touched = false;

  if ("scheduledDays" in body) {
    merged.scheduledDays = validateDays(body.scheduledDays, false);
    touched = true;
  }
  if ("scheduledTime" in body) {
    merged.scheduledTime = validateTime(body.scheduledTime, true)!;
    touched = true;
  }
  if ("timezone" in body) {
    merged.timezone = validateTimezone(body.timezone, true)!;
    touched = true;
  }
  if ("episodeDurationMs" in body) {
    merged.episodeDurationMs = validateDuration(body.episodeDurationMs, "episodeDurationMs", true)!;
    touched = true;
  }
  if ("ambientDurationMs" in body) {
    merged.ambientDurationMs = validateDuration(body.ambientDurationMs, "ambientDurationMs", true)!;
    touched = true;
  }
  if (!touched) {
    throw badRequest("schedule patch contained no recognized fields");
  }
  return merged;
}
