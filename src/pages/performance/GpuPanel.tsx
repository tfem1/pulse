import { Gauge } from 'lucide-react';
import { useMemo } from 'react';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { KeyValue } from '@/components/KeyValue';
import { Meter } from '@/components/Meter';
import { Unavailable } from '@/components/Unavailable';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/i18n';
import { formatBytes, formatMhz, formatNumber, formatPercent, formatTemp } from '@/lib/format';
import type { GpuSnapshot } from '@/lib/types';
import { percent } from '@/lib/utils';
import { K, useMetrics } from '@/stores/metrics';

function GpuCard({ gpu, range }: { gpu: GpuSnapshot; range: number }) {
  const t = useT();
  const usage = useMemo(
    () => [{ key: K.gpu(gpu.index), label: t('gpu.usage'), color: 1 as const, fill: true }],
    [gpu.index, t],
  );
  const vram = useMemo(
    () => [{ key: K.gpuMem(gpu.index), label: t('gpu.vram'), color: 2 as const }],
    [gpu.index, t],
  );
  const temp = useMemo(
    () => [{ key: K.gpuTemp(gpu.index), label: t('gpu.temperature'), color: 3 as const }],
    [gpu.index, t],
  );
  const memPct = gpu.memoryUsed != null && gpu.memoryTotal ? percent(gpu.memoryUsed, gpu.memoryTotal) : null;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{gpu.name}</CardTitle>
          <p className="mt-0.5 text-xs text-muted">
            {gpu.vendor} · GPU {gpu.index}
          </p>
        </div>
        <Badge variant="outline">{gpu.backend.toUpperCase()}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {gpu.usage != null ? (
              <TimeSeriesChart
                series={usage}
                seconds={range}
                yMax={100}
                height={200}
                format={(v) => `${v.toFixed(0)}%`}
                ariaLabel={t('gpu.usage')}
              />
            ) : (
              <Unavailable title={t('gpu.usageUnavailable')} description={t('gpu.usageUnavailableHint')} />
            )}
          </div>
          <KeyValue
            columns={1}
            items={[
              [t('gpu.usage'), formatPercent(gpu.usage)],
              [
                t('gpu.vram'),
                gpu.memoryUsed != null
                  ? `${formatBytes(gpu.memoryUsed)} / ${formatBytes(gpu.memoryTotal)}`
                  : '—',
              ],
              [t('gpu.temperature'), formatTemp(gpu.temperatureC)],
              [
                t('gpu.power'),
                gpu.powerW != null
                  ? `${formatNumber(gpu.powerW, 1)} W${gpu.powerLimitW ? ` / ${formatNumber(gpu.powerLimitW, 0)} W` : ''}`
                  : '—',
              ],
              [t('gpu.fan'), formatPercent(gpu.fanPercent)],
              [t('gpu.clock'), formatMhz(gpu.clockMhz)],
            ]}
          />
        </div>
        {memPct != null && <Meter value={memPct} label={t('gpu.vram')} />}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {gpu.memoryUsed != null && (
            <TimeSeriesChart
              series={vram}
              seconds={range}
              yMax={gpu.memoryTotal ?? undefined}
              height={160}
              format={(v) => formatBytes(v, 1)}
              ariaLabel={t('gpu.vram')}
            />
          )}
          {gpu.temperatureC != null && (
            <TimeSeriesChart
              series={temp}
              seconds={range}
              height={160}
              yMinMax={100}
              format={(v) => `${v.toFixed(0)} °C`}
              ariaLabel={t('gpu.temperature')}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function GpuPanel({ range }: { range: number }) {
  const t = useT();
  const gpus = useMetrics((s) => s.snapshot?.gpus);
  if (gpus === null) {
    return (
      <Unavailable icon={<Gauge />} title={t('gpu.disabled')} description={t('common.enableInMonitoring')} />
    );
  }
  if (!gpus || gpus.length === 0) {
    return <Unavailable icon={<Gauge />} title={t('gpu.noneDetected')} description={t('gpu.noneHint')} />;
  }
  return (
    <div className="space-y-gap">
      {gpus.map((g) => (
        <GpuCard key={g.index} gpu={g} range={range} />
      ))}
    </div>
  );
}
