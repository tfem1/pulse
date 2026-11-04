/**
 * Process actions with confirmation and permission-aware error reporting.
 * Returns imperative handlers plus the dialogs to render.
 */
import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { DangerGlyph } from '@/components/DangerGlyph';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useT, type TKey } from '@/i18n';
import { backend } from '@/lib/api';
import { PRIORITIES, type Priority, type ProcessInfo } from '@/lib/types';
import { useConfig } from '@/stores/config';
import { useProcesses } from '@/stores/processes';
import { toast } from '@/stores/toast';

export const PRIORITY_KEYS: Record<Priority, TKey> = {
  idle: 'priority.idle',
  belowNormal: 'priority.belowNormal',
  normal: 'priority.normal',
  aboveNormal: 'priority.aboveNormal',
  high: 'priority.high',
  realtime: 'priority.realtime',
};

export function isSuspended(p: ProcessInfo): boolean {
  return p.status === 'suspended' || p.status === 'stopped';
}

export function useProcessActions() {
  const t = useT();
  const confirmKill = useConfig((s) => s.config?.processes.confirmKill ?? true);
  const patchConfig = useConfig((s) => s.patch);
  const removeLocal = useProcesses((s) => s.remove);
  const patchStatus = useProcesses((s) => s.patchStatus);

  const [pendingKill, setPendingKill] = useState<{ p: ProcessInfo; force: boolean } | null>(null);
  const [dontAsk, setDontAsk] = useState(false);
  const [priorityFor, setPriorityFor] = useState<ProcessInfo | null>(null);
  const [priority, setPriority] = useState<Priority>('normal');
  const [busy, setBusy] = useState(false);

  const doKill = async (p: ProcessInfo, force: boolean) => {
    try {
      await backend().killProcess(p.pid, force);
      removeLocal(p.pid);
      toast.success(t(force ? 'process.killed' : 'process.ended', { name: p.name, pid: p.pid }));
    } catch (e) {
      toast.error(t('process.actionFailed', { name: p.name }), e);
    }
  };

  const requestKill = (p: ProcessInfo, force: boolean) => {
    if (confirmKill) {
      setDontAsk(false);
      setPendingKill({ p, force });
    } else {
      void doKill(p, force);
    }
  };

  const suspend = async (p: ProcessInfo) => {
    try {
      await backend().suspendProcess(p.pid);
      patchStatus(p.pid, 'suspended');
      toast.success(t('process.suspended', { name: p.name }));
    } catch (e) {
      toast.error(t('process.actionFailed', { name: p.name }), e);
    }
  };

  const resume = async (p: ProcessInfo) => {
    try {
      await backend().resumeProcess(p.pid);
      patchStatus(p.pid, 'running');
      toast.success(t('process.resumed', { name: p.name }));
    } catch (e) {
      toast.error(t('process.actionFailed', { name: p.name }), e);
    }
  };

  const openPriority = async (p: ProcessInfo) => {
    setPriorityFor(p);
    try {
      setPriority(await backend().getProcessPriority(p.pid));
    } catch {
      setPriority('normal');
    }
  };

  const applyPriority = async () => {
    if (!priorityFor) return;
    setBusy(true);
    try {
      await backend().setProcessPriority(priorityFor.pid, priority);
      toast.success(
        t('process.priorityChanged', { name: priorityFor.name, priority: t(PRIORITY_KEYS[priority]) }),
      );
      setPriorityFor(null);
    } catch (e) {
      toast.error(t('process.actionFailed', { name: priorityFor.name }), e);
    } finally {
      setBusy(false);
    }
  };

  const dialogs = (
    <>
      <AlertDialog open={!!pendingKill} onOpenChange={(o) => !o && setPendingKill(null)}>
        <AlertDialogContent>
          {pendingKill && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {pendingKill.force ? (
                    <DangerGlyph className="h-5 w-5" />
                  ) : (
                    <TriangleAlert className="h-5 w-5 text-warning" />
                  )}
                  {t(pendingKill.force ? 'process.confirmKillTitle' : 'process.confirmEndTitle', {
                    name: pendingKill.p.name,
                  })}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t(pendingKill.force ? 'process.confirmKillBody' : 'process.confirmEndBody', {
                    pid: pendingKill.p.pid,
                  })}
                  {pendingKill.p.isSystem && (
                    <span className="mt-2 block font-semibold text-fg">{t('process.systemWarning')}</span>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="flex items-center gap-2">
                <Checkbox id="dont-ask" checked={dontAsk} onCheckedChange={(v) => setDontAsk(v === true)} />
                <Label htmlFor="dont-ask" className="font-normal text-muted">
                  {t('process.dontAskAgain')}
                </Label>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  danger
                  onClick={() => {
                    const { p, force } = pendingKill;
                    if (dontAsk) void patchConfig((c) => void (c.processes.confirmKill = false));
                    void doKill(p, force);
                  }}
                >
                  {t(pendingKill.force ? 'process.forceKill' : 'process.endTask')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!priorityFor} onOpenChange={(o) => !o && setPriorityFor(null)}>
        <DialogContent closeLabel={t('common.close')}>
          <DialogHeader>
            <DialogTitle>{t('process.setPriority')}</DialogTitle>
            <DialogDescription>
              {priorityFor && `${priorityFor.name} · PID ${priorityFor.pid}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="priority-select">{t('process.priority')}</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
              <SelectTrigger id="priority-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {t(PRIORITY_KEYS[p])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted">{t('process.priorityHint')}</p>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPriorityFor(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={applyPriority} disabled={busy}>
              {t('common.apply')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  return { requestKill, suspend, resume, openPriority, dialogs };
}
