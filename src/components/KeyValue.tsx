import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function KeyValue({
  items,
  className,
  columns = 2,
}: {
  items: [ReactNode, ReactNode][];
  className?: string;
  columns?: 1 | 2 | 3;
}) {
  return (
    <dl
      className={cn(
        'grid gap-x-6 gap-y-2 text-sm',
        columns === 1 && 'grid-cols-1',
        columns === 2 && 'grid-cols-1 sm:grid-cols-2',
        columns === 3 && 'grid-cols-1 sm:grid-cols-3',
        className,
      )}
    >
      {items.map(([k, v], i) => (
        <div
          key={i}
          className="flex min-w-0 items-baseline justify-between gap-3 border-b border-border py-1 last:border-b-0"
        >
          <dt className="shrink-0 text-muted">{k}</dt>
          <dd className="num selectable min-w-0 truncate text-right font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
