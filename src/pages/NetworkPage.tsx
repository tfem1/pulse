import { ArrowDown, ArrowUp, Cable, Network, Wifi } from 'lucide-react';
import { useState } from 'react';
import { RangeSelector, type RangeSec } from '@/components/charts/RangeSelector';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { KeyValue } from '@/components/KeyValue';
import { PageHeader } from '@/components/PageHeader';
import { Unavailable } from '@/components/Unavailable';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useInterval } from '@/hooks/useInterval';
import { useT } from '@/i18n';
import { backend } from '@/lib/api';
import { formatBits, formatBytes, formatNumber, formatRate } from '@/lib/format';
import type { ConnectionSummary, NetworkSnapshot } from '@/lib/types';
import { errorMessage } from '@/lib/types';
import { cn } from '@/lib/utils';
import { K, useMetrics } from '@/stores/metrics';

function InterfaceButton({
  n,
  active,
  onClick,
}: {
  n: NetworkSnapshot;
  active: boolean;
  onClick: () => void;
}) {
  const t = useT();
  const Icon = n.name.toLowerCase().startsWith('w') ? Wifi : Cable;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex w-full flex-col gap-2 rounded-lg border bg-surface p-3 text-left transition-colors hover:bg-surface-hover',
        active && 'border-2 border-border-strong',
        n.state !== 'up' && 'opacity-60',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <Icon className="h-4 w-4 shrink-0 text-muted" />
          <span className="truncate">{n.name}</span>
        </span>
        <span className="flex gap-1">
          {n.isVirtual && <Badge variant="muted">{t('network.virtual')}</Badge>}
          <Badge variant={n.state === 'up' ? 'outline' : 'muted'}>
            {t(n.state === 'up' ? 'network.up' : n.state === 'down' ? 'network.down' : 'network.unknown')}
          </Badge>
        </span>
      </div>
      <div className="num flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1">
          <ArrowDown className="h-3 w-3" /> {formatRate(n.rxBps)}
        </span>
        <span className="flex items-center gap-1">
          <ArrowUp className="h-3 w-3" /> {formatRate(n.txBps)}
        </span>
      </div>
    </button>
  );
}

function Connections() {
  const t = useT();
  const [data, setData] = useState<ConnectionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  useInterval(() => {
    backend()
      .getConnections()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(errorMessage(e)));
  }, 3000);

  if (error) return <Unavailable title={t('network.connectionsUnavailable')} description={error} />;
  if (!data) return <p className="text-sm text-muted">{t('common.loading')}</p>;
  const maxState = Math.max(1, ...data.tcpStates.map(([, n]) => n));

  return (
    <div className="grid grid-cols-1 gap-gap xl:grid-cols-2">
      <div className="space-y-3">
        <div className="num grid grid-cols-4 gap-2 text-center">
          {[
            ['TCP', data.tcpTotal],
            ['TCP6', data.tcp6Total],
            ['UDP', data.udpTotal],
            ['UDP6', data.udp6Total],
          ].map(([k, v]) => (
            <div key={k} className="rounded-md border p-2">
              <p className="text-[11px] text-faint">{k}</p>
              <p className="text-lg font-semibold">{formatNumber(v as number)}</p>
            </div>
          ))}
        </div>
        <ul className="space-y-1.5" aria-label={t('network.tcpStates')}>
          {data.tcpStates.map(([state, n]) => (
            <li key={state} className="flex items-center gap-3 text-sm">
              <span className="w-28 shrink-0 font-mono text-xs text-muted">{state}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-hover">
                <span
                  className={cn(
                    'block h-full rounded-full',
                    state === 'ESTABLISHED' ? 'bg-chart-1' : 'bg-chart-3',
                  )}
                  style={{ width: `${(n / maxState) * 100}%` }}
                />
              </span>
              <span className="num w-10 text-right font-medium">{n}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-2 text-xs font-medium text-muted">
          {t('network.listening', { count: data.listening.length })}
        </p>
        <div className="max-h-72 overflow-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-bg-elevated text-left text-xs text-faint">
              <tr>
                <th className="px-3 py-1.5 font-medium">{t('network.protocol')}</th>
                <th className="px-3 py-1.5 font-medium">{t('network.address')}</th>
                <th className="px-3 py-1.5 text-right font-medium">{t('network.port')}</th>
                <th className="px-3 py-1.5 text-right font-medium">PID</th>
              </tr>
            </thead>
            <tbody>
              {data.listening.map((l) => (
                <tr key={`${l.protocol}-${l.address}-${l.port}`} className="border-t">
                  <td className="px-3 py-1 font-mono text-xs uppercase">{l.protocol}</td>
                  <td className="selectable px-3 py-1 font-mono text-xs">{l.address}</td>
                  <td className="num px-3 py-1 text-right font-medium">{l.port}</td>
                  <td className="num px-3 py-1 text-right text-muted">{l.pid ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function NetworkPage() {
  const t = useT();
  const networks = useMetrics((s) => s.snapshot?.networks);
  const [showVirtual, setShowVirtual] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [range, setRange] = useState<RangeSec>(60);

  const list = (networks ?? []).filter((n) => showVirtual || (!n.isVirtual && !n.isLoopback));
  const shown = list.length ? list : (networks ?? []).filter((n) => !n.isLoopback);
  const current = shown.find((n) => n.name === selected) ?? shown.find((n) => n.state === 'up') ?? shown[0];
  const series = current
    ? [
        { key: K.ifRx(current.name), label: t('network.download'), color: 1 as const, fill: true },
        { key: K.ifTx(current.name), label: t('network.upload'), color: 3 as const, dash: [6, 3] },
      ]
    : [];

  if (networks === null) {
    return (
      <>
        <PageHeader title={t('network.title')} />
        <Unavailable
          icon={<Network />}
          title={t('network.disabled')}
          description={t('common.enableInMonitoring')}
        />
      </>
    );
  }

  return (
    <div className="space-y-gap">
      <PageHeader
        title={t('network.title')}
        description={t('network.description')}
        actions={
          <div className="flex items-center gap-2">
            <Switch id="show-virtual" checked={showVirtual} onCheckedChange={setShowVirtual} />
            <Label htmlFor="show-virtual" className="font-normal text-muted">
              {t('network.showVirtual')}
            </Label>
          </div>
        }
      />
      <div className="grid grid-cols-1 gap-gap lg:grid-cols-[280px_1fr]">
        <div className="space-y-2" role="group" aria-label={t('network.interfaces')}>
          {shown.map((n) => (
            <InterfaceButton
              key={n.name}
              n={n}
              active={current?.name === n.name}
              onClick={() => setSelected(n.name)}
            />
          ))}
        </div>
        {current && (
          <div className="space-y-gap">
            <Card>
              <CardHeader className="items-center">
                <div>
                  <CardTitle>{current.name}</CardTitle>
                  <CardDescription>{t('network.throughput')}</CardDescription>
                </div>
                <RangeSelector value={range} onChange={setRange} />
              </CardHeader>
              <CardContent>
                <TimeSeriesChart
                  series={series}
                  seconds={range}
                  height={220}
                  yMinMax={16 * 1024}
                  format={(v) => formatRate(v, 0)}
                  ariaLabel={`${current.name} ${t('network.throughput')}`}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('network.details')}</CardTitle>
              </CardHeader>
              <CardContent>
                <KeyValue
                  items={[
                    [t('network.download'), formatRate(current.rxBps)],
                    [t('network.upload'), formatRate(current.txBps)],
                    [t('network.totalReceived'), formatBytes(current.totalRx)],
                    [t('network.totalSent'), formatBytes(current.totalTx)],
                    [t('network.linkSpeed'), formatBits(current.linkSpeedBps)],
                    [t('network.mtu'), formatNumber(current.mtu)],
                    [t('network.mac'), current.mac],
                    [
                      t('network.errors'),
                      `${formatNumber(current.totalErrorsRx)} / ${formatNumber(current.totalErrorsTx)}`,
                    ],
                  ]}
                />
                {current.ips.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1 text-xs font-medium text-muted">{t('network.addresses')}</p>
                    <ul className="flex flex-wrap gap-1.5">
                      {current.ips.map((ip) => (
                        <li key={ip} className="selectable rounded border px-2 py-0.5 font-mono text-xs">
                          {ip}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t('network.connections')}</CardTitle>
            <CardDescription>{t('network.connectionsHint')}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Connections />
        </CardContent>
      </Card>
    </div>
  );
}
