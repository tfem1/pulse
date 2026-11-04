import { CircleCheck, CircleDashed, TriangleAlert } from 'lucide-react';
import { useT } from '@/i18n';
import type { Level } from '@/lib/levels';
import { DangerGlyph } from './DangerGlyph';
import { cn } from '@/lib/utils';

/**
 * Status is conveyed by *shape* (circle / triangle / octagon), lightness and
 * stroke weight — never by hue.
 */
export function StatusIcon({
  level,
  className,
  label,
}: {
  level: Level;
  className?: string;
  label?: string;
}) {
  const t = useT();
  const names = {
    ok: t('status.ok'),
    warning: t('status.warning'),
    danger: t('status.danger'),
    unknown: t('status.unknown'),
  };
  const text = label ?? names[level];
  const common = cn('h-4 w-4 shrink-0', className);
  return (
    <span className="inline-flex" role="img" aria-label={text} title={text}>
      {level === 'ok' && <CircleCheck className={cn(common, 'text-success')} strokeWidth={2} />}
      {level === 'warning' && <TriangleAlert className={cn(common, 'text-warning')} strokeWidth={2.5} />}
      {level === 'danger' && <DangerGlyph className={common} />}
      {level === 'unknown' && <CircleDashed className={cn(common, 'text-faint')} strokeWidth={2} />}
    </span>
  );
}
