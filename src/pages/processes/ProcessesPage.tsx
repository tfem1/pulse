import { CircleX, Gauge, Info, ListTree, Pause, Play, Rows3, Search, Skull } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useT } from '@/i18n';
import { formatNumber, formatPercent } from '@/lib/format';
import type { ProcessInfo, ProcessSortKey } from '@/lib/types';
import { useConfig } from '@/stores/config';
import { useMetrics } from '@/stores/metrics';
import { useProcesses } from '@/stores/processes';
import { ProcessDetailsDialog } from './ProcessDetailsDialog';
import { ProcessTable, type Row, type RowActions } from './ProcessTable';
import { isSuspended, useProcessActions } from './useProcessActions';

const STATUS_ORDER: Record<string, number> = {
  running: 0,
  sleeping: 1,
  idle: 2,
  suspended: 3,
  stopped: 3,
  zombie: 4,
};

function comparator(key: ProcessSortKey, desc: boolean) {
  const dir = desc ? -1 : 1;
  return (a: ProcessInfo, b: ProcessInfo): number => {
    let r: number;
    switch (key) {
      case 'name':
        r = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        break;
      case 'user':
        r = (a.user ?? '').localeCompare(b.user ?? '');
        break;
      case 'status':
        r = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
        break;
      case 'disk':
        r = a.diskReadBps + a.diskWriteBps - (b.diskReadBps + b.diskWriteBps);
        break;
      case 'threads':
        r = (a.threads ?? 0) - (b.threads ?? 0);
        break;
      default:
        r = (a[key] as number) - (b[key] as number);
    }
    return r * dir || a.pid - b.pid;
  };
}

function matches(p: ProcessInfo, q: string): boolean {
  if (!q) return true;
  if (/^\d+$/.test(q)) return String(p.pid).startsWith(q);
  const s = q.toLowerCase();
  return (
    p.name.toLowerCase().includes(s) ||
    p.cmd.toLowerCase().includes(s) ||
    (p.user ?? '').toLowerCase().includes(s)
  );
}

export function ProcessesPage() {
  const t = useT();
  const cfg = useConfig((s) => s.config?.processes);
  const processes = useProcesses((s) => s.processes);
  const loaded = useProcesses((s) => s.updatedAt !== null);
  const start = useProcesses((s) => s.start);
  const stop = useProcesses((s) => s.stop);
  const totalMemory = useMetrics((s) => s.snapshot?.memory.total ?? 0);
  const totalCpu = useMetrics((s) => s.snapshot?.cpu.total);

  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<ProcessSortKey>(cfg?.defaultSort ?? 'cpu');
  const [sortDesc, setSortDesc] = useState(cfg?.sortDescending ?? true);
  const [showSystem, setShowSystem] = useState(cfg?.showSystem ?? true);
  const [tree, setTree] = useState(cfg?.treeView ?? false);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<number | null>(null);
  const [details, setDetails] = useState<ProcessInfo | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const { requestKill, suspend, resume, openPriority, dialogs } = useProcessActions();

  useEffect(() => {
    start();
    return stop;
  }, [start, stop]);

  // "/" or Ctrl+F focuses the search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === 'INPUT';
      if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f')) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const byPid = useMemo(() => new Map(processes.map((p) => [p.pid, p])), [processes]);

  const rows: Row[] = useMemo(() => {
    const cmp = comparator(sortKey, sortDesc);
    const visible = processes.filter((p) => (showSystem || !p.isSystem) && matches(p, query.trim()));
    if (!tree || query.trim()) {
      return visible.sort(cmp).map((p) => ({ p, depth: 0, hasChildren: false, expanded: false }));
    }
    // Tree: parents that are filtered out promote their children to roots.
    const ids = new Set(visible.map((p) => p.pid));
    const children = new Map<number, ProcessInfo[]>();
    const roots: ProcessInfo[] = [];
    for (const p of visible) {
      if (p.parent != null && ids.has(p.parent) && p.parent !== p.pid) {
        const list = children.get(p.parent) ?? [];
        list.push(p);
        children.set(p.parent, list);
      } else roots.push(p);
    }
    const out: Row[] = [];
    const walk = (list: ProcessInfo[], depth: number) => {
      list.sort(cmp);
      for (const p of list) {
        const kids = children.get(p.pid);
        const expanded = !collapsed.has(p.pid);
        out.push({ p, depth, hasChildren: !!kids?.length, expanded });
        if (kids && expanded && depth < 32) walk(kids, depth + 1);
      }
    };
    walk(roots, 0);
    return out;
  }, [processes, sortKey, sortDesc, showSystem, query, tree, collapsed]);

  const selectedProc = selected != null ? (byPid.get(selected) ?? null) : null;

  const actions: RowActions = {
    end: (p) => requestKill(p, false),
    kill: (p) => requestKill(p, true),
    suspend: (p) => void suspend(p),
    resume: (p) => void resume(p),
    priority: (p) => void openPriority(p),
    details: (p) => setDetails(p),
  };

  const onSort = (k: ProcessSortKey) => {
    if (k === sortKey) setSortDesc((d) => !d);
    else {
      setSortKey(k);
      setSortDesc(k !== 'name' && k !== 'user' && k !== 'pid' && k !== 'status');
    }
  };

  return (
    <div className="flex h-full min-h-[480px] flex-col">
      <PageHeader
        title={t('processes.title')}
        description={t('processes.summary', {
          count: formatNumber(rows.length),
          total: formatNumber(processes.length),
          cpu: formatPercent(totalCpu),
        })}
      />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            placeholder={t('processes.searchPlaceholder')}
            aria-label={t('processes.search')}
            className="pl-8"
          />
        </div>
        <ToggleGroup
          type="single"
          value={tree ? 'tree' : 'list'}
          onValueChange={(v) => v && setTree(v === 'tree')}
        >
          <ToggleGroupItem value="list" aria-label={t('processes.listView')}>
            <Rows3 /> {t('processes.list')}
          </ToggleGroupItem>
          <ToggleGroupItem value="tree" aria-label={t('processes.treeView')}>
            <ListTree /> {t('processes.tree')}
          </ToggleGroupItem>
        </ToggleGroup>
        <div className="flex items-center gap-2">
          <Switch id="show-system" checked={showSystem} onCheckedChange={setShowSystem} />
          <Label htmlFor="show-system" className="font-normal text-muted">
            {t('processes.showSystem')}
          </Label>
        </div>

        <div
          className="ml-auto flex flex-wrap items-center gap-2"
          aria-label={t('processes.selectionActions')}
        >
          <Button
            variant="ghost"
            size="sm"
            disabled={!selectedProc}
            onClick={() => selectedProc && actions.details(selectedProc)}
          >
            <Info /> {t('process.details')}
          </Button>
          {selectedProc && isSuspended(selectedProc) ? (
            <Button variant="secondary" size="sm" onClick={() => actions.resume(selectedProc)}>
              <Play /> {t('process.resume')}
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              disabled={!selectedProc}
              onClick={() => selectedProc && actions.suspend(selectedProc)}
            >
              <Pause /> {t('process.suspend')}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            disabled={!selectedProc}
            onClick={() => selectedProc && actions.priority(selectedProc)}
          >
            <Gauge /> {t('process.priority')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!selectedProc}
            onClick={() => selectedProc && actions.end(selectedProc)}
          >
            <CircleX /> {t('process.endTask')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={!selectedProc}
            onClick={() => selectedProc && actions.kill(selectedProc)}
          >
            <Skull /> {t('process.forceKill')}
          </Button>
        </div>
      </div>

      <ProcessTable
        rows={rows}
        selected={selected}
        onSelect={setSelected}
        sortKey={sortKey}
        sortDesc={sortDesc}
        onSort={onSort}
        onToggle={(pid) =>
          setCollapsed((s) => {
            const n = new Set(s);
            if (n.has(pid)) n.delete(pid);
            else n.add(pid);
            return n;
          })
        }
        actions={actions}
        totalMemory={totalMemory}
        loading={!loaded}
      />
      <p className="mt-2 text-xs text-faint">{t('processes.keyboardHint')}</p>

      <ProcessDetailsDialog
        process={details ? (byPid.get(details.pid) ?? details) : null}
        parentName={details?.parent != null ? byPid.get(details.parent)?.name : undefined}
        onOpenChange={(o) => !o && setDetails(null)}
      />
      {dialogs}
    </div>
  );
}
