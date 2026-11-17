/** Returns a validated IANA time zone, or throws rather than guessing a zone. */
export function validateTimeZone(timeZone: string): string {
  if (!timeZone || timeZone.length > 128) throw new Error("Invalid time zone");
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone }).resolvedOptions().timeZone;
  } catch {
    throw new Error("Invalid time zone");
  }
}

/** Stable local-week key from noon until midnight Monday, allowing worker recovery. */
export function weeklyDeliveryKey(now: Date, timeZone: string): string | null {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: validateTimeZone(timeZone), weekday: "short", year: "numeric",
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map(({ type, value }) => [type, value]));
  if (parts.weekday !== "Mon" || Number(parts.hour) < 12) return null;
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Format occurrence times in the recipient's zone, including the zone name. */
export function formatOccurrence(startsAt: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: validateTimeZone(timeZone), weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(startsAt);
}
