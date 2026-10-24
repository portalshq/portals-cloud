import { twMerge } from 'tailwind-merge';

import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const scopeAPilotMailto = '/pilot#scope';
export const contactPortalsHref = '/contact';

export function formatNumber(index: number) {
  return String(index + 1).padStart(2, '0');
}

export function formatReadableDate(dateString: string | null | undefined): string | null {
  if (!dateString) return null
  try {
    // Parse the YYYY-MM-DD calendar date and ignore any time component so
    // ISO datetimes ('2026-10-27T04:00:00.000Z') format like date-only
    // strings without a timezone-dependent day shift.
    const [year, month, day] = dateString.slice(0, 10).split('-').map(Number)
    if (isNaN(year) || isNaN(month) || isNaN(day)) return dateString
    // Validate month and day ranges
    if (month < 1 || month > 12 || day < 1 || day > 31) return dateString

    const date = new Date(year, month - 1, day)
    const formatted = date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    return formatted
  } catch {
    return dateString
  }
}
