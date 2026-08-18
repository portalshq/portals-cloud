import { twMerge } from 'tailwind-merge';

import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const scopeAPilotMailto = '/paid-pilot#scope';
export const contactPortalsHref = '/contact';

export function formatNumber(index: number) {
  return String(index + 1).padStart(2, '0');
}

export function formatReadableDate(dateString: string | null | undefined): string | null {
  if (!dateString) return null
  try {
    // Parse the date as YYYY-MM-DD to avoid timezone issues
    const [year, month, day] = dateString.split('-').map(Number)
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
