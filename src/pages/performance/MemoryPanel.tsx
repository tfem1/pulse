import { useMemo } from 'react';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { KeyValue } from '@/components/KeyValue';
import { Meter } from '@/components/Meter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/i18n';
import { formatBytes, formatPercent } from '@/lib/format';
import { percent } from '@/lib/utils';
import { K, useMetrics } from '@/stores/metrics';

/** Stacked composition bar: used (solid), cache (hatched light), free (empty). */
function Composition({ used, cached, total }: { used: number; cached: number; total: number }) {
  const t = useT();
  const u = percent(used, total);
  const c = Math.min(100 - u, percent(cached, total));
  return (
    <div>
      <div
        className="flex h-6 w-full overflow-hidden rounded-md border"
        role="img"
        aria-label={t('memory.composition')}
      >
        <div className="h-full bg-chart-1" style={{ width: `${u}%` }} />
        <div
          className="h-full"
          style={{
            width: `${c}%`,
            backgroundImage: 'repeating-linear-gradient(90deg, var(--chart-3) 0 2px, transparent 2px 5px)',
          }}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-chart-1" /> {t('memory.used')} {formatBytes(used)}
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="h-3 w-3 rounded-sm border"
            style={{
              backgroundImage: 'repeating-linear-gradient(90deg, var(--chart-3) 0 2px, transparent 2px 5px)',
            }}
          />
          {t('memory.cached')} {formatBytes(cached)}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border" /> {t('memory.free')}{' '}
          {formatBytes(Math.max(0, total - used - cached))}
        </span>
      </div>
    </div>
  );
}

export function MemoryPanel({ range }: { range: number }) {
  const t = useT();
  const m = useMetrics((s) => s.snapshot?.memory);
  const series = useMemo(
    () => [
      { key: K.mem, label: t('memory.used'), color: 1 as const, fill: true },
      { key: K.swap, label: t('memory.swap'), color: 3 as const, dash: [6, 3] },
    ],
    [t],
  );
  if (!m) return null;
  const memPct = percent(m.used, m.total);
  const swapPct = percent(m.swapUsed, m.swapTotal);
  const b = m.breakdown;

  return (
    <div className="space-y-gap">
      <div className="grid grid-cols-1 gap-gap md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('metric.memory')}</CardTitle>
            <span className="num text-2xl font-semibold">{formatPercent(memPct, 1)}</span>
          </CardHeader>
          <CardContent className="space-y-3">
            <Meter value={memPct} label={t('metric.memory')} />
            <Composition used={m.used} cached={b?.cached ?? 0} total={m.total} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('memory.swap')}</CardTitle>
            <span className="num text-2xl font-semibold">
              {m.swapTotal ? formatPercent(swapPct, 1) : '—'}
            </span>
          </CardHeader>
          <CardContent className="space-y-3">
            {m.swapTotal ? (
              <>
                <Meter value={swapPct} warn={50} danger={80} label={t('memory.swap')} />
                <p className="num text-sm text-muted">
                  {formatBytes(m.swapUsed)} / {formatBytes(m.swapTotal)}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted">{t('memory.noSwap')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('memory.history')}</CardTitle>
        </CardHeader>
        <CardContent>
          <TimeSeriesChart
            series={series}
            seconds={range}
            yMax={Math.max(m.total, m.swapTotal)}
            height={240}
            format={(v) => formatBytes(v, 1)}
            ariaLabel={t('memory.history')}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('memory.breakdown')}</CardTitle>
        </CardHeader>
        <CardContent>
          <KeyValue
            items={[
              [t('memory.total'), formatBytes(m.total)],
              [t('memory.used'), formatBytes(m.used)],
              [t('memory.available'), formatBytes(m.available)],
              [t('memory.free'), formatBytes(m.free)],
              [t('memory.cached'), formatBytes(b?.cached)],
              [t('memory.buffers'), formatBytes(b?.buffers)],
              [t('memory.shared'), formatBytes(b?.shared)],
              [t('memory.kernel'), formatBytes(b?.kernel)],
              [
                t('memory.committed'),
                b?.committed != null ? `${formatBytes(b.committed)} / ${formatBytes(b.commitLimit)}` : '—',
              ],
              [t('memory.dirty'), formatBytes(b?.dirty)],
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
