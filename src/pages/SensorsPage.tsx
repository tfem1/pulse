import { Fan, Thermometer, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Sparkline } from '@/components/charts/Sparkline';
import { PageHeader } from '@/components/PageHeader';
import { StatusIcon } from '@/components/StatusIcon';
import { levelFor } from '@/lib/levels';
import { Unavailable } from '@/components/Unavailable';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useT } from '@/i18n';
import { formatSensor } from '@/lib/format';
import type { SensorKind, SensorReading } from '@/lib/types';
import { K, useMetrics } from '@/stores/metrics';

type Filter = 'all' | 'temperature' | 'fan' | 'voltage' | 'power';
type Extremes = Map<string, { min: number; max: number }>;

function accumulate(prev: Extremes, readings: SensorReading[] | undefined): Extremes {
  if (!readings?.length) return prev;
  const next: Extremes = new Map(prev);
  for (const r of readings) {
    const e = next.get(r.id);
    next.set(
      r.id,
      e ? { min: Math.min(e.min, r.value), max: Math.max(e.max, r.value) } : { min: r.value, max: r.value },
    );
  }
  return next;
}

/** Temperature level relative to the sensor's own critical/max threshold. */
function tempLevel(r: SensorReading) {
  if (r.kind !== 'temperature') return null;
  const limit = r.critical ?? r.max ?? 100;
  return levelFor((r.value / limit) * 100, 80, 95);
}

export function SensorsPage() {
  const t = useT();
  const sensors = useMetrics((s) => s.snapshot?.sensors);
  const [filter, setFilter] = useState<Filter>('all');
  // Session min/max per sensor (the OS rarely exposes history), accumulated
  // from the metrics store so it also covers ticks between renders.
  const [extremes, setExtremes] = useState<Extremes>(() =>
    accumulate(new Map(), useMetrics.getState().snapshot?.sensors?.readings),
  );
  useEffect(
    () =>
      useMetrics.subscribe((s, prev) => {
        const readings = s.snapshot?.sensors?.readings;
        if (readings && s.snapshot !== prev.snapshot) setExtremes((m) => accumulate(m, readings));
      }),
    [],
  );

  const groups = useMemo(() => {
    const map = new Map<string, SensorReading[]>();
    for (const r of sensors?.readings ?? []) {
      if (filter !== 'all' && r.kind !== (filter as SensorKind)) continue;
      const list = map.get(r.chip) ?? [];
      list.push(r);
      map.set(r.chip, list);
    }
    return [...map.entries()];
  }, [sensors, filter]);

  if (sensors === null) {
    return (
      <>
        <PageHeader title={t('sensors.title')} />
        <Unavailable
          icon={<Thermometer />}
          title={t('sensors.disabled')}
          description={t('common.enableInMonitoring')}
        />
      </>
    );
  }

  const hottest = (sensors?.readings ?? [])
    .filter((r) => r.kind === 'temperature')
    .sort((a, b) => b.value - a.value)[0];

  return (
    <div className="space-y-gap">
      <PageHeader
        title={t('sensors.title')}
        description={
          sensors?.source ? t('sensors.source', { source: sensors.source }) : t('sensors.description')
        }
        actions={
          <ToggleGroup
            type="single"
            value={filter}
            onValueChange={(v) => v && setFilter(v as Filter)}
            aria-label={t('sensors.filter')}
          >
            <ToggleGroupItem value="all">{t('sensors.all')}</ToggleGroupItem>
            <ToggleGroupItem value="temperature">
              <Thermometer /> {t('sensors.temperatures')}
            </ToggleGroupItem>
            <ToggleGroupItem value="fan">
              <Fan /> {t('sensors.fans')}
            </ToggleGroupItem>
            <ToggleGroupItem value="voltage">
              <Zap /> {t('sensors.voltages')}
            </ToggleGroupItem>
            <ToggleGroupItem value="power">{t('sensors.power')}</ToggleGroupItem>
          </ToggleGroup>
        }
      />

      {sensors?.message && (
        <div
          role="status"
          className="rounded-lg border border-dashed border-border-strong bg-surface p-4 text-sm text-muted"
        >
          {sensors.message}
        </div>
      )}

      {hottest && (
        <p className="num text-sm text-muted">
          {t('sensors.hottest', {
            label: `${hottest.chip} · ${hottest.label}`,
            value: formatSensor(hottest.value, hottest.unit),
          })}
        </p>
      )}

      {groups.length === 0 ? (
        !sensors?.message && <Unavailable icon={<Thermometer />} title={t('sensors.none')} />
      ) : (
        <div className="grid grid-cols-1 gap-gap lg:grid-cols-2 2xl:grid-cols-3">
          {groups.map(([chip, readings]) => (
            <Card key={chip}>
              <CardHeader>
                <CardTitle className="truncate">{chip}</CardTitle>
                <Badge variant="muted">{readings.length}</Badge>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead className="sr-only">
                    <tr>
                      <th>{t('sensors.sensor')}</th>
                      <th>{t('sensors.value')}</th>
                      <th>{t('sensors.minMax')}</th>
                      <th>{t('sensors.trend')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {readings.map((r) => {
                      const ext = extremes.get(r.id);
                      const lvl = tempLevel(r);
                      return (
                        <tr key={r.id} className="border-t first:border-t-0">
                          <td className="max-w-0 py-1.5 pr-2">
                            <span className="flex items-center gap-1.5">
                              {lvl && <StatusIcon level={lvl} className="h-3.5 w-3.5" />}
                              <span className="truncate" title={r.id}>
                                {r.label}
                              </span>
                            </span>
                          </td>
                          <td className="num whitespace-nowrap py-1.5 text-right font-semibold">
                            {formatSensor(r.value, r.unit)}
                          </td>
                          <td className="num whitespace-nowrap py-1.5 pl-3 text-right text-xs text-faint">
                            {ext ? `${formatSensor(ext.min, r.unit)} – ${formatSensor(ext.max, r.unit)}` : ''}
                            {r.critical != null && (
                              <span className="block">
                                {t('sensors.critical')} {formatSensor(r.critical, r.unit)}
                              </span>
                            )}
                          </td>
                          <td className="w-20 py-1.5 pl-3">
                            <Sparkline seriesKey={K.sensor(r.id)} points={60} height={20} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
