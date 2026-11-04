import { cn, clamp } from '@/lib/utils';
import { levelFor } from '@/lib/levels';

/**
 * Horizontal usage bar. Normal → solid mid grey; warning → light grey with
 * a heavy outline; danger → hatched fill. Readable without colour vision.
 */
export function Meter({
  value,
  warn = 75,
  danger = 90,
  label,
  className,
  thin,
}: {
  value: number | null | undefined;
  warn?: number;
  danger?: number;
  label?: string;
  className?: string;
  thin?: boolean;
}) {
  const v = value == null || !Number.isFinite(value) ? 0 : clamp(value, 0, 100);
  const level = levelFor(value, warn, danger);
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
      aria-label={label}
      className={cn(
        'relative w-full overflow-hidden rounded-full bg-surface-hover',
        thin ? 'h-1.5' : 'h-2',
        className,
      )}
    >
      <div
        className={cn(
          'h-full rounded-full',
          level === 'danger' && 'hatched',
          level === 'warning' && 'bg-warning',
          (level === 'ok' || level === 'unknown') && 'bg-chart-3',
        )}
        style={{ width: `${v}%` }}
      />
      {/* Threshold ticks */}
      <span className="absolute inset-y-0 w-px bg-border-strong" style={{ left: `${warn}%` }} aria-hidden />
      <span className="absolute inset-y-0 w-px bg-border-strong" style={{ left: `${danger}%` }} aria-hidden />
    </div>
  );
}
