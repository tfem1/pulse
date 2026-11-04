import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useT } from '@/i18n';
import { useConfig } from '@/stores/config';

const RANGES = [60, 300, 900] as const;
export type RangeSec = (typeof RANGES)[number];

/** 60 s / 5 min / 15 min. Ranges longer than the configured history are disabled. */
export function RangeSelector({ value, onChange }: { value: RangeSec; onChange: (v: RangeSec) => void }) {
  const t = useT();
  const historyMinutes = useConfig((s) => s.config?.monitoring.historyMinutes ?? 15);
  const labels: Record<RangeSec, string> = { 60: t('range.60s'), 300: t('range.5m'), 900: t('range.15m') };
  return (
    <ToggleGroup
      type="single"
      value={String(value)}
      onValueChange={(v) => v && onChange(Number(v) as RangeSec)}
      aria-label={t('range.label')}
    >
      {RANGES.map((r) => (
        <ToggleGroupItem
          key={r}
          value={String(r)}
          disabled={r / 60 > historyMinutes}
          aria-label={labels[r]}
          title={r / 60 > historyMinutes ? t('range.needsHistory') : undefined}
        >
          {labels[r]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
