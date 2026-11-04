import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Sparkline } from './charts/Sparkline';
import { Meter } from './Meter';
import { levelFor } from '@/lib/levels';
import { StatusIcon } from './StatusIcon';

/** Summary tile: big value, secondary line, optional meter and sparkline. */
export function StatCard({
  title,
  icon,
  value,
  sub,
  percent,
  sparkKey,
  sparkMax,
  to,
  unavailable,
  warn = 75,
  danger = 90,
  children,
}: {
  title: string;
  icon: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  percent?: number | null;
  sparkKey?: string;
  sparkMax?: number;
  to?: string;
  unavailable?: boolean;
  warn?: number;
  danger?: number;
  children?: ReactNode;
}) {
  const body = (
    <Card
      className={cn(
        'flex h-full flex-col gap-3 p-card transition-colors',
        to && 'hover:border-border-strong hover:bg-surface-hover',
        unavailable && 'opacity-60',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-muted [&_svg]:h-4 [&_svg]:w-4">
          {icon}
          <span className="truncate">{title}</span>
        </div>
        {percent != null && <StatusIcon level={levelFor(percent, warn, danger)} />}
      </div>
      <div>
        <div className="num text-2xl font-semibold tracking-tight">{value}</div>
        {sub && <div className="num mt-0.5 truncate text-xs text-muted">{sub}</div>}
      </div>
      {percent != null && <Meter value={percent} warn={warn} danger={danger} thin />}
      {sparkKey && !unavailable && <Sparkline seriesKey={sparkKey} max={sparkMax} />}
      {children}
    </Card>
  );
  return to ? (
    <Link to={to} className="block h-full rounded-lg">
      {body}
    </Link>
  ) : (
    body
  );
}
