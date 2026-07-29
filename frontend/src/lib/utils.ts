import { twMerge } from 'tailwind-merge';

import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const scopeAPilotMailto = `mailto:sales@portals.works?subject=${encodeURIComponent('Scope a portals pilot')}&body=${encodeURIComponent(`Hi Portals,

I’d like to request access to Portals and learn more about how it can support our creative production workflow.

A bit about us:
- Company:
- Team size:
- Use case:
- Current tools/workflow:
- Timeline:

Please let me know the next steps.

Best,
[Your Name]`)}`;

export const contactPortalsMailto = `mailto:sales@portals.works?subject=${encodeURIComponent('Contact Portals')}&body=${encodeURIComponent(`Introduce yourself our team.

Let us know we can support your creative production workflow!

Feel free to include details:
- Company:
- Your name:
- Team size:
- Use case:
- Current tools/workflow:
- Timeline:

We look forward to hearing from you!
`)}`;

export function formatNumber(index: number) {
  return String(index + 1).padStart(3, '0');
}