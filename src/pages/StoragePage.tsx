import { ArrowUp, Folder, FolderOpen, FolderSearch, HardDrive, Loader2, Usb } from 'lucide-react';
import { useState } from 'react';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { RangeSelector, type RangeSec } from '@/components/charts/RangeSelector';
import { Meter } from '@/components/Meter';
import { PageHeader } from '@/components/PageHeader';
import { StatusIcon } from '@/components/StatusIcon';
import { levelFor } from '@/lib/levels';
import { Unavailable } from '@/components/Unavailable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useT } from '@/i18n';
import { backend } from '@/lib/api';
import { formatBytes, formatNumber, formatPercent, formatRate } from '@/lib/format';
import type { DiskSnapshot, ScanResult } from '@/lib/types';
import { cn, percent } from '@/lib/utils';
import { K, useMetrics } from '@/stores/metrics';
import { toast } from '@/stores/toast';

function PartitionCard({
  d,
  selected,
  onSelect,
  onScan,
}: {
  d: DiskSnapshot;
  selected: boolean;
  onSelect: () => void;
  onScan: () => void;
}) {
  const t = useT();
  const used = d.total - d.available;
  const pct = percent(used, d.total);
  return (
    <Card className={cn('flex flex-col gap-3 p-card', selected && 'border-2 border-border-strong')}>
      <button
        type="button"
        onClick={onSelect}
        className="flex items-start justify-between gap-2 rounded text-left"
        aria-pressed={selected}
      >
        <div className="flex min-w-0 items-center gap-2">
          {d.removable ? (
            <Usb className="h-4 w-4 shrink-0 text-muted" />
          ) : (
            <HardDrive className="h-4 w-4 shrink-0 text-muted" />
          )}
          <div className="min-w-0">
            <p className="selectable truncate text-sm font-semibold">{d.mountPoint}</p>
            <p className="truncate text-xs text-muted">
              {d.name} · {d.fileSystem}
            </p>
          </div>
        </div>
        <StatusIcon level={levelFor(pct, 85, 95)} />
      </button>
      <div>
        <div className="mb-1 flex justify-between text-xs">
          <span className="num font-medium">{formatPercent(pct, 1)}</span>
          <span className="num text-muted">
            {formatBytes(used)} / {formatBytes(d.total)}
          </span>
        </div>
        <Meter value={pct} warn={85} danger={95} label={d.mountPoint} />
        <p className="num mt-1 text-xs text-faint">{t('storage.free', { size: formatBytes(d.available) })}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {d.kind !== 'unknown' && <Badge variant="outline">{d.kind.toUpperCase()}</Badge>}
        {d.removable && <Badge variant="outline">{t('storage.removable')}</Badge>}
        {d.readOnly && <Badge variant="outline">{t('storage.readOnly')}</Badge>}
      </div>
      <div className="num grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-faint">{t('disk.read')}</p>
          <p className="font-medium">{formatRate(d.readBps)}</p>
        </div>
        <div>
          <p className="text-faint">{t('disk.write')}</p>
          <p className="font-medium">{formatRate(d.writeBps)}</p>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={onScan} className="mt-auto">
        <FolderSearch /> {t('storage.findLargest')}
      </Button>
    </Card>
  );
}

function SpaceScanner({ initialPath }: { initialPath: string }) {
  const t = useT();
  const [path, setPath] = useState(initialPath);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);

  const scan = async (p = path) => {
    if (!p.trim()) return;
    setLoading(true);
    setPath(p);
    try {
      setResult(await backend().scanDirectory(p.trim()));
    } catch (e) {
      toast.error(t('storage.scanFailed'), e);
    } finally {
      setLoading(false);
    }
  };

  const parent = (p: string) => {
    const trimmed = p.replace(/[\\/]+$/, '');
    const i = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
    if (i <= 0) return trimmed.includes('\\') ? trimmed.slice(0, 3) : '/';
    return trimmed.slice(0, i) || '/';
  };

  const max = result?.entries[0]?.size ?? 1;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{t('storage.topConsumers')}</CardTitle>
          <CardDescription>{t('storage.topConsumersHint')}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void scan();
          }}
        >
          <Input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            aria-label={t('storage.path')}
            className="min-w-[240px] flex-1 font-mono"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={async () => {
              const dir = await backend().pickDirectory();
              if (dir) void scan(dir);
            }}
          >
            <FolderOpen /> {t('common.browse')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!result || loading}
            onClick={() => result && scan(parent(result.path))}
          >
            <ArrowUp /> {t('storage.up')}
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <FolderSearch />} {t('storage.scan')}
          </Button>
        </form>

        {result && (
          <>
            <p className="num text-xs text-muted">
              {t('storage.scanSummary', {
                size: formatBytes(result.totalSize),
                items: formatNumber(result.totalItems),
                ms: formatNumber(result.elapsedMs),
              })}
              {result.errors > 0 && ` · ${t('storage.scanErrors', { count: result.errors })}`}
              {result.truncated && ` · ${t('storage.truncated')}`}
            </p>
            <ul className="space-y-1">
              {result.entries.map((e) => (
                <li key={e.path}>
                  <button
                    type="button"
                    disabled={!e.isDir || loading}
                    onClick={() => scan(e.path)}
                    className="group relative flex w-full items-center gap-3 overflow-hidden rounded-md border px-3 py-2 text-left text-sm enabled:hover:bg-surface-hover disabled:cursor-default"
                    title={e.isDir ? t('storage.drillDown') : undefined}
                  >
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 bg-surface-hover"
                      style={{ width: `${(e.size / max) * 100}%` }}
                    />
                    <span className="relative flex min-w-0 flex-1 items-center gap-2">
                      {e.isDir ? (
                        <Folder className="h-4 w-4 shrink-0 text-muted" />
                      ) : (
                        <span className="w-4" />
                      )}
                      <span className="selectable truncate">{e.name}</span>
                    </span>
                    {e.isDir && (
                      <span className="num relative text-xs text-faint">{formatNumber(e.items)}</span>
                    )}
                    <span className="num relative w-24 text-right font-medium">{formatBytes(e.size)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function StoragePage() {
  const t = useT();
  const disks = useMetrics((s) => s.snapshot?.disks);
  const [selected, setSelected] = useState<string | null>(null);
  const [range, setRange] = useState<RangeSec>(60);
  const [scanPath, setScanPath] = useState<string | null>(null);

  const current = disks?.find((d) => d.mountPoint === selected) ?? disks?.[0];
  const series = current
    ? [
        { key: K.diskRead(current.mountPoint), label: t('disk.read'), color: 1 as const, fill: true },
        { key: K.diskWrite(current.mountPoint), label: t('disk.write'), color: 3 as const, dash: [6, 3] },
      ]
    : [];

  if (disks === null) {
    return (
      <>
        <PageHeader title={t('storage.title')} />
        <Unavailable
          icon={<HardDrive />}
          title={t('disk.disabled')}
          description={t('common.enableInMonitoring')}
        />
      </>
    );
  }
  if (!disks) return null;

  const total = disks.reduce((a, d) => a + d.total, 0);
  const free = disks.reduce((a, d) => a + d.available, 0);

  return (
    <div className="space-y-gap">
      <PageHeader
        title={t('storage.title')}
        description={t('storage.summary', {
          count: disks.length,
          used: formatBytes(total - free),
          total: formatBytes(total),
        })}
      />
      <div className="grid grid-cols-1 gap-gap md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {disks.map((d) => (
          <PartitionCard
            key={d.mountPoint}
            d={d}
            selected={current?.mountPoint === d.mountPoint}
            onSelect={() => setSelected(d.mountPoint)}
            onScan={() => setScanPath(d.mountPoint)}
          />
        ))}
      </div>

      {current && (
        <Card>
          <CardHeader className="items-center">
            <CardTitle>{t('storage.ioFor', { mount: current.mountPoint })}</CardTitle>
            <RangeSelector value={range} onChange={setRange} />
          </CardHeader>
          <CardContent>
            <TimeSeriesChart
              series={series}
              seconds={range}
              height={200}
              yMinMax={1024 * 1024}
              format={(v) => formatRate(v, 0)}
              ariaLabel={t('storage.ioFor', { mount: current.mountPoint })}
            />
          </CardContent>
        </Card>
      )}

      <SpaceScanner key={scanPath ?? 'default'} initialPath={scanPath ?? current?.mountPoint ?? '/'} />
    </div>
  );
}
