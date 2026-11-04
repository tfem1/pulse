/**
 * Virtualised process table. Only the visible rows (+ overscan) are in the
 * DOM, so hundreds of processes refresh every second at negligible cost.
 * Keyboard: ↑/↓/PgUp/PgDn/Home/End move the selection, Enter opens details,
 * Del ends the task, Shift+Del force-kills, ←/→ collapse/expand in tree view.
 */
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Circle,
  CirclePause,
  CircleX,
  Disc,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useT, type TKey } from '@/i18n';
import { formatBytes, formatNumber, formatPercent, formatRate } from '@/lib/format';
import type { ProcessInfo, ProcessSortKey } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useAppearance } from '@/stores/appearance';
import { statusLabel } from './status';
import { isSuspended } from './useProcessActions';

export interface Row {
  p: ProcessInfo;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
}

export interface RowActions {
  end: (p: ProcessInfo) => void;
  kill: (p: ProcessInfo) => void;
  suspend: (p: ProcessInfo) => void;
  resume: (p: ProcessInfo) => void;
  priority: (p: ProcessInfo) => void;
  details: (p: ProcessInfo) => void;
}

/** Status shape: filled = running, ring = sleeping, pause = suspended, x = zombie/dead. */
function StatusGlyph({ status }: { status: string }) {
  const cls = 'h-3 w-3 shrink-0';
  if (status === 'running') return <Disc className={cn(cls, 'fill-fg text-fg')} />;
  if (status === 'suspended' || status === 'stopped')
    return <CirclePause className={cn(cls, 'text-warning')} strokeWidth={2.5} />;
  if (status === 'zombie' || status === 'dead')
    return <CircleX className={cn(cls, 'text-danger')} strokeWidth={2.5} />;
  return <Circle className={cn(cls, 'text-faint')} />;
}

/** Greyscale "heat" behind numeric cells, like Task Manager but hue-free. */
function heat(fraction: number): CSSProperties | undefined {
  const f = Math.min(1, Math.max(0, fraction));
  if (f < 0.02) return undefined;
  return { backgroundColor: `color-mix(in srgb, var(--text) ${Math.round(4 + f * 30)}%, transparent)` };
}

const COLS: { key: ProcessSortKey; labelKey: TKey; align?: 'right'; width: string }[] = [
  { key: 'name', labelKey: 'process.name', width: 'minmax(220px, 1fr)' },
  { key: 'pid', labelKey: 'process.pid', align: 'right', width: '80px' },
  { key: 'user', labelKey: 'process.user', width: '120px' },
  { key: 'status', labelKey: 'process.status', width: '120px' },
  { key: 'cpu', labelKey: 'process.cpu', align: 'right', width: '80px' },
  { key: 'memory', labelKey: 'process.memory', align: 'right', width: '100px' },
  { key: 'disk', labelKey: 'process.disk', align: 'right', width: '110px' },
  { key: 'threads', labelKey: 'process.threads', align: 'right', width: '80px' },
];
const TEMPLATE = COLS.map((c) => c.width).join(' ');
const OVERSCAN = 8;

export function ProcessTable({
  rows,
  selected,
  onSelect,
  sortKey,
  sortDesc,
  onSort,
  onToggle,
  actions,
  totalMemory,
}: {
  rows: Row[];
  selected: number | null;
  onSelect: (pid: number | null) => void;
  sortKey: ProcessSortKey;
  sortDesc: boolean;
  onSort: (k: ProcessSortKey) => void;
  onToggle: (pid: number) => void;
  actions: RowActions;
  totalMemory: number;
}) {
  const t = useT();
  const density = useAppearance((s) => s.density);
  const rowH = density === 'compact' ? 26 : 34;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(600);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewH(el.clientHeight));
    ro.observe(el);
    setViewH(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const first = Math.max(0, Math.floor(scrollTop / rowH) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((scrollTop + viewH) / rowH) + OVERSCAN);
  const visible = rows.slice(first, last);
  const selIndex = selected == null ? -1 : rows.findIndex((r) => r.p.pid === selected);

  // Keep the selected row in view when it changes via the keyboard.
  const lastSel = useRef<number | null>(null);
  useEffect(() => {
    if (selected === lastSel.current) return;
    lastSel.current = selected;
    const el = scrollRef.current;
    if (!el || selIndex < 0) return;
    const top = selIndex * rowH;
    const header = rowH;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + rowH > el.scrollTop + el.clientHeight - header)
      el.scrollTop = top + rowH - el.clientHeight + header;
  }, [selected, selIndex, rowH]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!rows.length) return;
    const page = Math.max(1, Math.floor(viewH / rowH) - 1);
    const move = (i: number) => {
      e.preventDefault();
      onSelect(rows[Math.min(rows.length - 1, Math.max(0, i))].p.pid);
    };
    const cur = selIndex < 0 ? -1 : selIndex;
    const row = cur >= 0 ? rows[cur] : null;
    switch (e.key) {
      case 'ArrowDown':
        return move(cur + 1);
      case 'ArrowUp':
        return move(cur < 0 ? 0 : cur - 1);
      case 'PageDown':
        return move(cur + page);
      case 'PageUp':
        return move(cur - page);
      case 'Home':
        return move(0);
      case 'End':
        return move(rows.length - 1);
      case 'Enter':
        if (row) {
          e.preventDefault();
          actions.details(row.p);
        }
        return;
      case 'Delete':
        if (row) {
          e.preventDefault();
          if (e.shiftKey) actions.kill(row.p);
          else actions.end(row.p);
        }
        return;
      case 'ArrowRight':
      case 'ArrowLeft':
        if (row?.hasChildren && row.expanded === (e.key === 'ArrowLeft')) {
          e.preventDefault();
          onToggle(row.p.pid);
        }
        return;
      case 'Escape':
        onSelect(null);
        return;
    }
  };

  return (
    <div
      ref={scrollRef}
      role="grid"
      aria-label={t('process.tableLabel')}
      aria-rowcount={rows.length + 1}
      aria-activedescendant={selected != null ? `proc-${selected}` : undefined}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      className="relative min-h-0 flex-1 overflow-auto rounded-lg border bg-surface"
    >
      <div
        role="row"
        className="sticky top-0 z-10 grid min-w-[900px] border-b-2 border-border-strong bg-bg-elevated text-xs font-semibold text-muted"
        style={{ gridTemplateColumns: TEMPLATE, height: rowH }}
      >
        {COLS.map((c) => {
          const active = c.key === sortKey;
          return (
            <div
              key={c.key}
              role="columnheader"
              aria-sort={active ? (sortDesc ? 'descending' : 'ascending') : 'none'}
              className="flex"
            >
              <button
                type="button"
                tabIndex={-1}
                onClick={() => onSort(c.key)}
                className={cn(
                  'flex w-full items-center gap-1 px-3 hover:text-fg',
                  c.align === 'right' && 'justify-end',
                  active && 'text-fg underline decoration-2 underline-offset-4',
                )}
              >
                {t(c.labelKey)}
                {active && (sortDesc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
              </button>
            </div>
          );
        })}
      </div>

      <div className="relative min-w-[900px]" style={{ height: rows.length * rowH }}>
        {visible.map((row, i) => {
          const { p } = row;
          const isSel = p.pid === selected;
          const diskTotal = p.diskReadBps + p.diskWriteBps;
          return (
            <ContextMenu key={p.pid}>
              <ContextMenuTrigger asChild>
                <div
                  id={`proc-${p.pid}`}
                  role="row"
                  aria-selected={isSel}
                  aria-rowindex={first + i + 2}
                  onMouseDown={() => onSelect(p.pid)}
                  onContextMenu={() => onSelect(p.pid)}
                  onDoubleClick={() => actions.details(p)}
                  className={cn(
                    'absolute left-0 right-0 grid cursor-default items-center border-b text-sm',
                    isSel
                      ? 'bg-surface-hover font-medium outline outline-2 -outline-offset-2 outline-border-strong'
                      : 'hover:bg-surface-hover',
                    isSuspended(p) && 'italic text-muted',
                  )}
                  style={{ gridTemplateColumns: TEMPLATE, height: rowH, top: (first + i) * rowH }}
                >
                  <div
                    role="gridcell"
                    className="flex min-w-0 items-center gap-1.5 px-3"
                    style={{ paddingLeft: 12 + row.depth * 16 }}
                  >
                    {row.hasChildren ? (
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-label={row.expanded ? t('common.collapse') : t('common.expand')}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={() => onToggle(p.pid)}
                        className="rounded text-faint hover:text-fg"
                      >
                        {row.expanded ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </button>
                    ) : (
                      row.depth > 0 && <span className="w-3.5" />
                    )}
                    <span className="truncate" title={p.cmd || p.name}>
                      {p.name}
                    </span>
                    {p.isSystem && (
                      <span className="shrink-0 text-[10px] uppercase text-faint">{t('process.sys')}</span>
                    )}
                  </div>
                  <div role="gridcell" className="num px-3 text-right text-muted">
                    {p.pid}
                  </div>
                  <div role="gridcell" className="truncate px-3 text-muted">
                    {p.user ?? '—'}
                  </div>
                  <div role="gridcell" className="flex items-center gap-1.5 truncate px-3 text-muted">
                    <StatusGlyph status={p.status} />
                    <span className="truncate">{statusLabel(t, p.status)}</span>
                  </div>
                  <div
                    role="gridcell"
                    className="num flex h-full items-center justify-end px-3"
                    style={heat(p.cpu / 50)}
                  >
                    {formatPercent(p.cpu, 1)}
                  </div>
                  <div
                    role="gridcell"
                    className="num flex h-full items-center justify-end px-3"
                    style={heat(totalMemory ? (p.memory / totalMemory) * 8 : 0)}
                  >
                    {formatBytes(p.memory)}
                  </div>
                  <div
                    role="gridcell"
                    className="num flex h-full items-center justify-end px-3"
                    style={heat(diskTotal / (50 * 1024 * 1024))}
                  >
                    {diskTotal > 0 ? formatRate(diskTotal) : '—'}
                  </div>
                  <div role="gridcell" className="num px-3 text-right text-muted">
                    {formatNumber(p.threads)}
                  </div>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onSelect={() => actions.details(p)}>{t('process.details')}</ContextMenuItem>
                <ContextMenuSeparator />
                {isSuspended(p) ? (
                  <ContextMenuItem onSelect={() => actions.resume(p)}>{t('process.resume')}</ContextMenuItem>
                ) : (
                  <ContextMenuItem onSelect={() => actions.suspend(p)}>
                    {t('process.suspend')}
                  </ContextMenuItem>
                )}
                <ContextMenuItem onSelect={() => actions.priority(p)}>
                  {t('process.setPriority')}…
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={() => actions.end(p)}>
                  {t('process.endTask')}
                  <span className="ml-auto text-xs text-faint">Del</span>
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => actions.kill(p)} className="font-semibold">
                  {t('process.forceKill')}
                  <span className="ml-auto text-xs text-faint">⇧Del</span>
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>
      {rows.length === 0 && (
        <p className="absolute inset-x-0 top-24 text-center text-sm text-muted">{t('process.noMatch')}</p>
      )}
    </div>
  );
}
