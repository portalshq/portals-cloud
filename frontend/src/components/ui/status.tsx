import React from 'react';
import { cn } from '../../lib/utils';

interface StatusPillProps {
  status: 'online' | 'synced' | 'waiting' | 'failed' | 'healthy' | 'idle' | 'warning';
  label?: string;
  className?: string;
}

export function StatusPill({ status, label, className }: StatusPillProps) {
  let colorClass = '';
  let dotClass = '';

  switch (status) {
    case 'online':
    case 'synced':
    case 'healthy':
      colorClass = 'text-portals-secondary border-portals-secondary/30 bg-portals-secondary/10';
      dotClass = 'bg-portals-secondary animate-pulse';
      break;
    case 'waiting':
    case 'idle':
      colorClass = 'text-portals-on-surface-variant border-portals-surface-variant bg-portals-surface-lowest';
      dotClass = 'bg-portals-on-surface-variant';
      break;
    case 'failed':
    case 'warning':
      colorClass = 'text-portals-error border-portals-error/30 bg-portals-error/10';
      dotClass = 'bg-portals-error animate-pulse';
      break;
  }

  return (
    <div className={cn('inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-xs font-mono uppercase tracking-wider', colorClass, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', dotClass)} />
      {label || status}
    </div>
  );
}
