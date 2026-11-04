import { cva } from 'class-variance-authority';

export const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-accent text-on-accent hover:opacity-90',
        secondary: 'border border-border-strong bg-surface text-fg hover:bg-surface-hover',
        outline: 'border border-border bg-transparent text-fg hover:bg-surface-hover',
        ghost: 'text-muted hover:bg-surface-hover hover:text-fg',
        // Danger is conveyed by a heavy outline + icon, not colour.
        danger: 'border-2 border-danger bg-transparent font-semibold text-danger hover:bg-surface-hover',
        link: 'text-fg underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-10 px-6',
        icon: 'h-9 w-9',
        'icon-sm': 'h-7 w-7',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);
