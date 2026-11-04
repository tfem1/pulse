import { Network } from 'lucide-react';
import { useMemo } from 'react';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { Unavailable } from '@/components/Unavailable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/i18n';
import { formatBytes, formatRate } from '@/lib/format';
import { K, useMetrics } from '@/stores/metrics';

export function NetworkPanel({ range }: { range: number }) {
  const t = useT();
  const snap = useMetrics((s) => s.snapshot);
  const series = useMemo(
    () => [
      { key: K.netRx, label: t('network.download'), color: 1 as const, fill: true },
      { key: K.netTx, label: t('network.upload'), color: 3 as const, dash: [6, 3] },
    ],
    [t],
  );
  if (!snap?.networks) {
    return (
      <Unavailable
        icon={<Network />}
        title={t('network.disabled')}
        description={t('common.enableInMonitoring')}
      />
    );
  }
  const active = snap.networks.filter((n) => !n.isLoopback);
  return (
    <div className="space-y-gap">
      <div className="grid grid-cols-2 gap-gap md:grid-cols-4">
        {[
          [t('network.download'), formatRate(snap.netRxBps)],
          [t('network.upload'), formatRate(snap.netTxBps)],
          [
            t('network.totalReceived'),
            formatBytes(active.filter((n) => !n.isVirtual).reduce((a, n) => a + n.totalRx, 0)),
          ],
          [
            t('network.totalSent'),
            formatBytes(active.filter((n) => !n.isVirtual).reduce((a, n) => a + n.totalTx, 0)),
          ],
        ].map(([k, v]) => (
          <Card key={k} className="p-card">
            <p className="text-xs text-muted">{k}</p>
            <p className="num mt-1 text-xl font-semibold">{v}</p>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t('network.throughput')}</CardTitle>
          <span className="text-xs text-muted">{t('network.physicalOnly')}</span>
        </CardHeader>
        <CardContent>
          <TimeSeriesChart
            series={series}
            seconds={range}
            height={240}
            yMinMax={64 * 1024}
            format={(v) => formatRate(v, 0)}
            ariaLabel={t('network.throughput')}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('network.interfaces')}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-faint">
              <tr>
                <th className="pb-2 font-medium">{t('network.interface')}</th>
                <th className="pb-2 font-medium">{t('network.state')}</th>
                <th className="pb-2 text-right font-medium">{t('network.download')}</th>
                <th className="pb-2 text-right font-medium">{t('network.upload')}</th>
                <th className="pb-2 text-right font-medium">{t('network.packets')}</th>
              </tr>
            </thead>
            <tbody>
              {active.map((n) => (
                <tr key={n.name} className="border-t">
                  <td className="py-1.5">
                    {n.name}
                    {n.isVirtual && <span className="ml-2 text-xs text-faint">{t('network.virtual')}</span>}
                  </td>
                  <td className="py-1.5 text-muted">
                    {t(
                      n.state === 'up'
                        ? 'network.up'
                        : n.state === 'down'
                          ? 'network.down'
                          : 'network.unknown',
                    )}
                  </td>
                  <td className="num py-1.5 text-right">{formatRate(n.rxBps)}</td>
                  <td className="num py-1.5 text-right">{formatRate(n.txBps)}</td>
                  <td className="num py-1.5 text-right text-muted">
                    {Math.round(n.packetsRxPs)} / {Math.round(n.packetsTxPs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
