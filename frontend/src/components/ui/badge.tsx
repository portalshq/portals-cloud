import * as React from 'react';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const badgeVariants = cva(
  'inline-flex items-center transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2' +
    ' hover-elevate ',
  {
    variants: {
      variant: {
        default:
          'rounded-[10px] bg-white/10 px-6 py-4 backdrop-blur-[20px] text-white border',
        secondary:
          'whitespace-nowrap rounded-md border bg-secondary text-secondary-foreground px-2.5 py-0.5 text-xs font-semibold',
        destructive:
          'whitespace-nowrap rounded-md border bg-destructive text-destructive-foreground shadow-xs px-2.5 py-0.5 text-xs font-semibold',
        outline: 'whitespace-nowrap rounded-md border text-foreground [border-color:var(--badge-outline)] px-2.5 py-0.5 text-xs font-semibold',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
