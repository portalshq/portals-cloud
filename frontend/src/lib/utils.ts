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
