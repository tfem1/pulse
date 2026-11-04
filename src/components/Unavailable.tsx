import { CircleSlash } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Graceful-degradation placeholder for metrics a platform cannot provide. */
export function Unavailable({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong p-8 text-center',
        className,
      )}
    >
      <div className="text-faint [&_svg]:h-7 [&_svg]:w-7">{icon ?? <CircleSlash />}</div>
      <p className="text-sm font-semibold text-fg">{title}</p>
      {description && <div className="max-w-md text-sm text-muted">{description}</div>}
      {action}
    </div>
  );
}
