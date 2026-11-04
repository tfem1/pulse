import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 [&_svg]:size-3',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-accent text-on-accent',
        outline: 'border-border-strong text-muted',
        muted: 'border-transparent bg-surface-hover text-muted',
        // Danger: inverted + bold so it reads without colour.
        danger: 'border-danger bg-danger font-bold text-bg',
        warning: 'border-2 border-warning font-semibold text-warning',
      },
    },
    defaultVariants: { variant: 'outline' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
