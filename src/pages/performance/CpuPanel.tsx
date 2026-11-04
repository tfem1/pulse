import { useMemo } from 'react';
import { Sparkline } from '@/components/charts/Sparkline';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { KeyValue } from '@/components/KeyValue';
import { Meter } from '@/components/Meter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/i18n';
import { formatMhz, formatNumber, formatPercent } from '@/lib/format';
import { K, useMetrics } from '@/stores/metrics';

export function CpuPanel({ range }: { range: number }) {
  const t = useT();
  const snap = useMetrics((s) => s.snapshot);
  const info = useMetrics((s) => s.systemInfo);
  const cores = snap?.cpu.perCore ?? [];
  const series = useMemo(() => [{ key: K.cpu, label: t('cpu.total'), color: 1 as const, fill: true }], [t]);
  const maxFreq = snap ? Math.max(0, ...snap.cpu.frequenciesMhz) : 0;

  return (
    <div className="space-y-gap">
      <div className="grid grid-cols-1 gap-gap xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>{t('cpu.utilisation')}</CardTitle>
            <span className="num text-2xl font-semibold">{formatPercent(snap?.cpu.total, 1)}</span>
          </CardHeader>
          <CardContent>
            <TimeSeriesChart
              series={series}
              seconds={range}
              yMax={100}
              height={240}
              format={(v) => `${v.toFixed(0)}%`}
              ariaLabel={t('cpu.utilisation')}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('cpu.details')}</CardTitle>
          </CardHeader>
          <CardContent>
            <KeyValue
              columns={1}
              items={[
                [t('system.cpu'), info?.cpuBrand || '—'],
                [t('cpu.vendor'), info?.cpuVendor || '—'],
                [t('system.cores'), `${info?.physicalCores ?? '?'} / ${info?.logicalCores ?? cores.length}`],
                [t('cpu.maxFrequency'), formatMhz(maxFreq)],
                [
                  t('cpu.load'),
                  snap?.cpu.loadAvg
                    ? snap.cpu.loadAvg.map((l) => l.toFixed(2)).join(' · ')
                    : t('common.unavailable'),
                ],
                [t('cpu.processes'), formatNumber(snap?.processCount)],
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('cpu.perCore')}</CardTitle>
          <span className="text-xs text-muted">{t('cpu.coreCount', { count: cores.length })}</span>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-8">
            {cores.map((c, i) => (
              <div key={i} className="rounded-md border p-2.5">
                <div className="mb-1 flex items-baseline justify-between text-xs">
                  <span className="text-muted">{t('cpu.core', { n: i })}</span>
                  <span className="num font-semibold">{formatPercent(c)}</span>
                </div>
                <Sparkline seriesKey={K.core(i)} max={100} height={28} points={Math.min(range, 120)} />
                <Meter value={c} thin className="mt-1.5" />
                <p className="num mt-1 text-[11px] text-faint">{formatMhz(snap?.cpu.frequenciesMhz[i])}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
