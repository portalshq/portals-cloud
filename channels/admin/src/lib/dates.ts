/**
 * Date/timezone helpers for the admin UI. Replaces the ebook app's
 * `@shared/date` module — same surface the tabs used.
 */

import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'

export { formatInTimeZone, fromZonedTime }

/** Common IANA timezones for schedule rules; the local zone is prepended at runtime. */
export const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/Denver', label: 'America/Denver' },
  { value: 'America/New_York', label: 'America/New_York' },
  { value: 'America/Chicago', label: 'America/Chicago' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles' },
  { value: 'Europe/London', label: 'Europe/London' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney' },
]

export function formatDisplayDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  try {
    return formatInTimeZone(new Date(date), 'UTC', "MMM d, yyyy 'at' h:mm a 'UTC'")
  } catch {
    return '—'
  }
}

/** Milliseconds → whole minutes for duration inputs; null on invalid input. */
export function msToMinutes(ms: number | undefined | null): number | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return null
  return Math.round(ms / 60_000)
}

/** Minutes → milliseconds for duration inputs; null on invalid input. */
export function minutesToMs(minutes: number | undefined | null): number | null {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) return null
  return Math.round(minutes * 60_000)
}
