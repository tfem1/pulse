import { HardDrive } from 'lucide-react';
import { useMemo } from 'react';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { Unavailable } from '@/components/Unavailable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/i18n';
import { formatBytes, formatRate } from '@/lib/format';
import { K, useMetrics } from '@/stores/metrics';

export function DiskPanel({ range }: { range: number }) {
  const t = useT();
  const snap = useMetrics((s) => s.snapshot);
  const series = useMemo(
    () => [
      { key: K.diskR, label: t('disk.read'), color: 1 as const, fill: true },
      { key: K.diskW, label: t('disk.write'), color: 3 as const, dash: [6, 3] },
    ],
    [t],
  );
  if (!snap?.disks) {
    return (
      <Unavailable
        icon={<HardDrive />}
        title={t('disk.disabled')}
        description={t('common.enableInMonitoring')}
      />
    );
  }
  return (
    <div className="space-y-gap">
      <div className="grid grid-cols-2 gap-gap md:grid-cols-4">
        {[
          [t('disk.read'), formatRate(snap.diskReadBps)],
          [t('disk.write'), formatRate(snap.diskWriteBps)],
          [t('disk.totalRead'), formatBytes(snap.disks.reduce((a, d) => a + d.totalRead, 0))],
          [t('disk.totalWritten'), formatBytes(snap.disks.reduce((a, d) => a + d.totalWritten, 0))],
        ].map(([k, v]) => (
          <Card key={k} className="p-card">
            <p className="text-xs text-muted">{k}</p>
            <p className="num mt-1 text-xl font-semibold">{v}</p>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t('disk.throughput')}</CardTitle>
        </CardHeader>
        <CardContent>
          <TimeSeriesChart
            series={series}
            seconds={range}
            height={240}
            yMinMax={1024 * 1024}
            format={(v) => formatRate(v, 0)}
            ariaLabel={t('disk.throughput')}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('disk.perDevice')}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-faint">
              <tr>
                <th className="pb-2 font-medium">{t('disk.mount')}</th>
                <th className="pb-2 font-medium">{t('disk.device')}</th>
                <th className="pb-2 font-medium">{t('disk.type')}</th>
                <th className="pb-2 text-right font-medium">{t('disk.read')}</th>
                <th className="pb-2 text-right font-medium">{t('disk.write')}</th>
              </tr>
            </thead>
            <tbody>
              {snap.disks.map((d) => (
                <tr key={d.mountPoint} className="border-t">
                  <td className="selectable py-1.5">{d.mountPoint}</td>
                  <td className="py-1.5 text-muted">{d.name}</td>
                  <td className="py-1.5 uppercase text-muted">{d.kind === 'unknown' ? '—' : d.kind}</td>
                  <td className="num py-1.5 text-right">{formatRate(d.readBps)}</td>
                  <td className="num py-1.5 text-right">{formatRate(d.writeBps)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
