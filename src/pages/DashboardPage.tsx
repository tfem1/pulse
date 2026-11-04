import { Activity, Cpu, Gauge, HardDrive, MemoryStick, Network, Timer } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { RangeSelector, type RangeSec } from '@/components/charts/RangeSelector';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { KeyValue } from '@/components/KeyValue';
import { Meter } from '@/components/Meter';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/i18n';
import {
  formatBytes,
  formatDuration,
  formatMhz,
  formatNumber,
  formatPercent,
  formatRate,
  formatTemp,
} from '@/lib/format';
import { percent } from '@/lib/utils';
import { K, useMetrics } from '@/stores/metrics';
import { useProcesses } from '@/stores/processes';

function TopProcesses() {
  const t = useT();
  const start = useProcesses((s) => s.start);
  const stop = useProcesses((s) => s.stop);
  const processes = useProcesses((s) => s.processes);
  useEffect(() => {
    start();
    return stop;
  }, [start, stop]);
  const top = useMemo(() => [...processes].sort((a, b) => b.cpu - a.cpu).slice(0, 6), [processes]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('dashboard.topProcesses')}</CardTitle>
        <Link to="/processes" className="text-xs text-muted underline-offset-4 hover:text-fg hover:underline">
          {t('common.viewAll')}
        </Link>
      </CardHeader>
      <CardContent>
        {top.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">{t('common.loading')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-faint">
              <tr>
                <th className="pb-2 font-medium">{t('process.name')}</th>
                <th className="pb-2 text-right font-medium">{t('process.cpu')}</th>
                <th className="pb-2 text-right font-medium">{t('process.memory')}</th>
              </tr>
            </thead>
            <tbody>
              {top.map((p) => (
                <tr key={p.pid} className="border-t">
                  <td className="max-w-0 truncate py-1.5 pr-2">
                    {p.name}
                    <span className="ml-2 text-xs text-faint">{p.pid}</span>
                  </td>
                  <td className="num py-1.5 text-right font-medium">{formatPercent(p.cpu, 1)}</td>
                  <td className="num py-1.5 text-right text-muted">{formatBytes(p.memory)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const t = useT();
  const snap = useMetrics((s) => s.snapshot);
  const info = useMetrics((s) => s.systemInfo);
  const [range, setRange] = useState<RangeSec>(60);

  const memPct = snap ? percent(snap.memory.used, snap.memory.total) : null;
  const freqs = snap?.cpu.frequenciesMhz.filter((f) => f > 0) ?? [];
  const avgFreq = freqs.length ? freqs.reduce((a, b) => a + b, 0) / freqs.length : null;
  const gpu = snap?.gpus?.[0];
  const gpuMemPct =
    gpu?.memoryUsed != null && gpu.memoryTotal ? percent(gpu.memoryUsed, gpu.memoryTotal) : null;
  const fullest = snap?.disks
    ?.filter((d) => d.total > 0)
    .map((d) => ({ d, pct: percent(d.total - d.available, d.total) }))
    .sort((a, b) => b.pct - a.pct)[0];

  const chartSeries = useMemo(
    () => [
      { key: K.cpu, label: t('metric.cpu'), color: 1 as const, fill: true },
      { key: K.memPct, label: t('metric.memory'), color: 3 as const, dash: [6, 3] },
    ],
    [t],
  );

  return (
    <div className="space-y-gap">
      <PageHeader
        title={t('dashboard.title')}
        description={
          info
            ? `${info.hostname ?? ''} · ${info.longOsVersion ?? info.osName ?? ''} · ${info.cpuBrand}`
            : undefined
        }
      />

      <div className="grid grid-cols-1 gap-gap sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard
          title={t('metric.cpu')}
          icon={<Cpu />}
          value={formatPercent(snap?.cpu.total)}
          sub={[
            avgFreq ? formatMhz(avgFreq) : null,
            snap?.cpu.loadAvg
              ? `${t('cpu.load')} ${snap.cpu.loadAvg.map((l) => l.toFixed(2)).join(' ')}`
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          percent={snap?.cpu.total}
          sparkKey={K.cpu}
          sparkMax={100}
          to="/performance?tab=cpu"
        />
        <StatCard
          title={t('metric.memory')}
          icon={<MemoryStick />}
          value={formatPercent(memPct)}
          sub={snap ? `${formatBytes(snap.memory.used)} / ${formatBytes(snap.memory.total)}` : undefined}
          percent={memPct}
          sparkKey={K.memPct}
          sparkMax={100}
          to="/performance?tab=memory"
        />
        <StatCard
          title={t('metric.disk')}
          icon={<HardDrive />}
          unavailable={!snap?.disks}
          value={snap?.disks ? formatRate(snap.diskReadBps + snap.diskWriteBps) : t('common.off')}
          sub={
            snap?.disks
              ? `R ${formatRate(snap.diskReadBps)} · W ${formatRate(snap.diskWriteBps)}`
              : t('common.disabledInSettings')
          }
          sparkKey={K.diskR}
          to="/storage"
        >
          {fullest && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted">
                <span className="truncate">{fullest.d.mountPoint}</span>
                <span className="num">{formatPercent(fullest.pct)}</span>
              </div>
              <Meter value={fullest.pct} warn={85} danger={95} thin />
            </div>
          )}
        </StatCard>
        <StatCard
          title={t('metric.network')}
          icon={<Network />}
          unavailable={!snap?.networks}
          value={snap?.networks ? `↓ ${formatRate(snap.netRxBps)}` : t('common.off')}
          sub={snap?.networks ? `↑ ${formatRate(snap.netTxBps)}` : t('common.disabledInSettings')}
          sparkKey={K.netRx}
          to="/network"
        />
        <StatCard
          title={t('metric.gpu')}
          icon={<Gauge />}
          unavailable={!gpu}
          value={gpu ? formatPercent(gpu.usage) : t('common.unavailable')}
          sub={
            gpu
              ? [
                  gpu.memoryUsed != null
                    ? `${formatBytes(gpu.memoryUsed)} / ${formatBytes(gpu.memoryTotal)}`
                    : null,
                  gpu.temperatureC != null ? formatTemp(gpu.temperatureC) : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || gpu.name
              : snap?.gpus
                ? t('gpu.noneDetected')
                : t('common.disabledInSettings')
          }
          percent={gpu?.usage ?? null}
          sparkKey={gpu ? K.gpu(gpu.index) : undefined}
          sparkMax={100}
          to="/performance?tab=gpu"
        >
          {gpuMemPct != null && (
            <p className="num text-xs text-faint">
              {t('gpu.vram')} {formatPercent(gpuMemPct)}
            </p>
          )}
        </StatCard>
        <StatCard
          title={t('metric.system')}
          icon={<Timer />}
          value={formatDuration(snap?.uptimeSecs)}
          sub={`${formatNumber(snap?.processCount)} ${t('dashboard.processes')}`}
        >
          <p className="num text-xs text-faint">
            {t('dashboard.pulseUsage', {
              cpu: formatPercent(snap?.selfUsage.cpuPercent, 1),
              mem: formatBytes(snap?.selfUsage.memoryBytes),
            })}
          </p>
        </StatCard>
      </div>

      <Card>
        <CardHeader className="items-center">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted" />
            <CardTitle>{t('dashboard.liveChart')}</CardTitle>
          </div>
          <RangeSelector value={range} onChange={setRange} />
        </CardHeader>
        <CardContent>
          <TimeSeriesChart
            series={chartSeries}
            seconds={range}
            yMax={100}
            height={260}
            format={(v) => `${v.toFixed(0)}%`}
            ariaLabel={t('dashboard.liveChart')}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-gap xl:grid-cols-2">
        <TopProcesses />
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.systemInfo')}</CardTitle>
            {info?.isElevated && <Badge variant="outline">{t('dashboard.elevated')}</Badge>}
          </CardHeader>
          <CardContent>
            <KeyValue
              columns={1}
              items={[
                [t('system.os'), info?.longOsVersion ?? info?.osName ?? '—'],
                [t('system.kernel'), info?.kernelVersion ?? '—'],
                [t('system.cpu'), info?.cpuBrand || '—'],
                [
                  t('system.cores'),
                  info
                    ? `${info.physicalCores ?? '?'} ${t('system.physical')} · ${info.logicalCores} ${t('system.logical')}`
                    : '—',
                ],
                [t('system.memory'), formatBytes(info?.totalMemory)],
                [t('system.arch'), info?.arch ?? '—'],
                [
                  t('system.gpuBackend'),
                  info?.gpuBackends.length ? info.gpuBackends.join(', ') : t('common.none'),
                ],
                [t('system.sensorSource'), snap?.sensors?.source ?? info?.sensorSource ?? t('common.none')],
              ]}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
