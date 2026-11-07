import { describe, it, expect } from 'vitest';
import { formatDisplayDate, formatInTimeZone, fromZonedTime, msToMinutes, minutesToMs } from './dates';

describe('formatDisplayDate', () => {
  it('formats an ISO instant in UTC', () => {
    expect(formatDisplayDate('2026-11-08T02:30:00Z')).toBe('Nov 8, 2026 at 2:30 AM UTC');
  });

  it('handles Date input and empty input', () => {
    expect(formatDisplayDate(new Date('2026-01-01T00:00:00Z'))).toContain('Jan 1, 2026');
    expect(formatDisplayDate(null)).toBe('—');
    expect(formatDisplayDate(undefined)).toBe('—');
  });

  it('returns a dash for unparseable values', () => {
    expect(formatDisplayDate('garbage')).toBe('—');
  });
});

describe('formatInTimeZone / fromZonedTime', () => {
  it('round-trips a wall time through a timezone', () => {
    const instant = fromZonedTime('2026-11-08 19:00:00', 'America/Denver');
    expect(formatInTimeZone(instant, 'America/Denver', 'HH:mm')).toBe('19:00');
    expect(formatInTimeZone(instant, 'UTC', 'HH:mm')).toBe('02:00');
  });
});

describe('duration conversions', () => {
  it('converts between ms and minutes', () => {
    expect(msToMinutes(1_800_000)).toBe(30);
    expect(minutesToMs(30)).toBe(1_800_000);
    expect(minutesToMs(msToMinutes(2_700_000)!)).toBe(2_700_000);
  });

  it('rejects invalid input', () => {
    expect(msToMinutes(undefined)).toBeNull();
    expect(msToMinutes(0)).toBeNull();
    expect(msToMinutes(-5)).toBeNull();
    expect(minutesToMs(0)).toBeNull();
    expect(minutesToMs(Number.NaN)).toBeNull();
  });
});
