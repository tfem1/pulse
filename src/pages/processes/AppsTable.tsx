/**
 * Apps view: one row per running application (all of its processes summed),
 * like Task Manager's "Apps" list. Expand a row to see its processes.
 * Keyboard: ↑/↓ select, →/← expand/collapse, Enter toggles, Del ends the app,
 * Shift+Del force-ends it.
 */
import {
  AppWindow,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  CircleX,
  Loader2,
  Skull,
} from 'lucide-react';
import { Fragment, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useT, type TKey } from '@/i18n';
import type { AppGroup } from '@/lib/apps';
import { formatBytes, formatPercent, formatRate } from '@/lib/format';
import type { ProcessSortKey } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useAppearance } from '@/stores/appearance';
import { heat, statusLabel } from './status';

const TEMPLATE = 'minmax(260px, 1fr) 100px 80px 100px 110px 132px';
const COLS: { key: ProcessSortKey | null; labelKey: TKey; align?: 'right' }[] = [
  { key: 'name', labelKey: 'process.name' },
  { key: null, labelKey: 'apps.processes', align: 'right' },
  { key: 'cpu', labelKey: 'process.cpu', align: 'right' },
  { key: 'memory', labelKey: 'process.memory', align: 'right' },
  { key: 'disk', labelKey: 'process.disk', align: 'right' },
  { key: null, labelKey: 'apps.action', align: 'right' },
];

export function AppsTable({
  apps,
  selected,
  onSelect,
  expanded,
  onToggle,
  sortKey,
  sortDesc,
  onSort,
  onEnd,
  closing,
  totalMemory,
  loading,
}: {
  apps: AppGroup[];
  selected: number | null;
  onSelect: (id: number | null) => void;
  expanded: Set<number>;
  onToggle: (id: number) => void;
  sortKey: ProcessSortKey;
  sortDesc: boolean;
  onSort: (k: ProcessSortKey) => void;
  onEnd: (app: AppGroup, force: boolean) => void;
  closing: Set<number>;
  totalMemory: number;
  loading: boolean;
}) {
  const t = useT();
  const density = useAppearance((s) => s.density);
  const rowH = density === 'compact' ? 30 : 40;
  const index = apps.findIndex((a) => a.id === selected);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!apps.length) return;
    const app = index >= 0 ? apps[index] : null;
    const move = (i: number) => {
      e.preventDefault();
      const next = apps[Math.min(apps.length - 1, Math.max(0, i))];
      onSelect(next.id);
      document.getElementById(`app-${next.id}`)?.scrollIntoView({ block: 'nearest' });
    };
    switch (e.key) {
      case 'ArrowDown':
        return move(index + 1);
      case 'ArrowUp':
        return move(index < 0 ? 0 : index - 1);
      case 'Home':
        return move(0);
      case 'End':
        return move(apps.length - 1);
      case 'ArrowRight':
      case 'ArrowLeft':
      case 'Enter':
        if (app && (e.key === 'Enter' || expanded.has(app.id) === (e.key === 'ArrowLeft'))) {
          e.preventDefault();
          onToggle(app.id);
        }
        return;
      case 'Delete':
        if (app) {
          e.preventDefault();
          onEnd(app, e.shiftKey);
        }
        return;
      case 'Escape':
        onSelect(null);
        return;
    }
  };

  return (
    <div
      role="grid"
      aria-label={t('apps.tableLabel')}
      aria-activedescendant={selected != null ? `app-${selected}` : undefined}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="relative min-h-0 flex-1 overflow-auto rounded-lg border bg-surface"
    >
      <div
        role="row"
        className="sticky top-0 z-10 grid min-w-[820px] border-b-2 border-border-strong bg-bg-elevated text-xs font-semibold text-muted"
        style={{ gridTemplateColumns: TEMPLATE, height: 34 }}
      >
        {COLS.map((c) => {
          const active = c.key === sortKey;
          return (
            <div
              key={c.labelKey}
              role="columnheader"
              aria-sort={active ? (sortDesc ? 'descending' : 'ascending') : undefined}
              className={cn('flex items-center px-3', c.align === 'right' && 'justify-end')}
            >
              {c.key ? (
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => onSort(c.key!)}
                  className={cn(
                    'flex items-center gap-1 hover:text-fg',
                    active && 'text-fg underline decoration-2 underline-offset-4',
                  )}
                >
                  {t(c.labelKey)}
                  {active && (sortDesc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                </button>
              ) : (
                t(c.labelKey)
              )}
            </div>
          );
        })}
      </div>

      {apps.map((app) => {
        const isSel = app.id === selected;
        const open = expanded.has(app.id);
        const busy = closing.has(app.id);
        return (
          <Fragment key={app.id}>
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <div
                  id={`app-${app.id}`}
                  role="row"
                  aria-selected={isSel}
                  aria-expanded={open}
                  onMouseDown={() => onSelect(app.id)}
                  onContextMenu={() => onSelect(app.id)}
                  onDoubleClick={() => onToggle(app.id)}
                  className={cn(
                    'grid min-w-[820px] cursor-default items-center border-b text-sm',
                    isSel
                      ? 'bg-surface-hover font-medium outline outline-2 -outline-offset-2 outline-border-strong'
                      : 'hover:bg-surface-hover',
                    busy && 'opacity-60',
                  )}
                  style={{ gridTemplateColumns: TEMPLATE, height: rowH }}
                >
                  <div role="gridcell" className="flex min-w-0 items-center gap-2 px-3">
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={open ? t('common.collapse') : t('common.expand')}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => onToggle(app.id)}
                      className="rounded text-faint hover:text-fg"
                    >
                      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <AppWindow className="h-4 w-4 shrink-0 text-muted" />
                    <span className="truncate font-medium">{app.name}</span>
                    {app.title && <span className="truncate text-xs text-faint">{app.title}</span>}
                    {app.suspended && (
                      <span className="shrink-0 text-[10px] uppercase text-warning">
                        {t('pstatus.suspended')}
                      </span>
                    )}
                  </div>
                  <div role="gridcell" className="num px-3 text-right text-muted">
                    {app.processes.length}
                  </div>
                  <div
                    role="gridcell"
                    className="num flex h-full items-center justify-end px-3"
                    style={heat(app.cpu / 50)}
                  >
                    {formatPercent(app.cpu, 1)}
                  </div>
                  <div
                    role="gridcell"
                    className="num flex h-full items-center justify-end px-3"
                    style={heat(totalMemory ? (app.memory / totalMemory) * 8 : 0)}
                  >
                    {formatBytes(app.memory)}
                  </div>
                  <div
                    role="gridcell"
                    className="num flex h-full items-center justify-end px-3"
                    style={heat(app.diskBps / (50 * 1024 * 1024))}
                  >
                    {app.diskBps > 0 ? formatRate(app.diskBps) : '—'}
                  </div>
                  <div role="gridcell" className="flex justify-end px-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      tabIndex={-1}
                      disabled={busy}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => onEnd(app, false)}
                      aria-label={`${t('process.endTask')} — ${app.name}`}
                    >
                      {busy ? <Loader2 className="animate-spin" /> : <CircleX />}
                      {busy ? t('apps.closing') : t('process.endTask')}
                    </Button>
                  </div>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onSelect={() => onToggle(app.id)}>
                  {open ? t('common.collapse') : t('apps.showProcesses')}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem disabled={busy} onSelect={() => onEnd(app, false)}>
                  {t('process.endTask')}
                  <span className="ml-auto text-xs text-faint">Del</span>
                </ContextMenuItem>
                <ContextMenuItem disabled={busy} onSelect={() => onEnd(app, true)} className="font-semibold">
                  <Skull /> {t('apps.forceEnd')}
                  <span className="ml-auto text-xs text-faint">⇧Del</span>
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
            {open &&
              app.processes.map((p) => (
                <div
                  key={p.pid}
                  role="row"
                  className="grid min-w-[820px] items-center border-b bg-bg text-xs text-muted"
                  style={{ gridTemplateColumns: TEMPLATE, height: Math.round(rowH * 0.8) }}
                >
                  <div role="gridcell" className="flex min-w-0 items-center gap-2 pl-14 pr-3">
                    <span className="truncate text-fg">{p.name}</span>
                    <span className="num shrink-0 text-faint">{p.pid}</span>
                    <span className="truncate text-faint">{statusLabel(t, p.status)}</span>
                  </div>
                  <div role="gridcell" />
                  <div role="gridcell" className="num px-3 text-right">
                    {formatPercent(p.cpu, 1)}
                  </div>
                  <div role="gridcell" className="num px-3 text-right">
                    {formatBytes(p.memory)}
                  </div>
                  <div role="gridcell" className="num px-3 text-right">
                    {p.diskReadBps + p.diskWriteBps > 0 ? formatRate(p.diskReadBps + p.diskWriteBps) : '—'}
                  </div>
                  <div role="gridcell" />
                </div>
              ))}
          </Fragment>
        );
      })}

      {apps.length === 0 && (
        <div className="absolute inset-x-0 top-20 px-6 text-center text-sm text-muted">
          <p>{loading ? t('common.loading') : t('apps.none')}</p>
          {!loading && <p className="mt-1 text-xs text-faint">{t('apps.noneHint')}</p>}
        </div>
      )}
    </div>
  );
}
