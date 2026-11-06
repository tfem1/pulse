/**
 * "End task" / "Force end" for whole applications (Apps view), with the
 * same confirmation preference as single processes.
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
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useT } from '@/i18n';
import { backend } from '@/lib/api';
import type { AppGroup } from '@/lib/apps';
import { useConfig } from '@/stores/config';
import { useProcesses } from '@/stores/processes';
import { toast } from '@/stores/toast';

export function useAppActions() {
  const t = useT();
  const confirmKill = useConfig((s) => s.config?.processes.confirmKill ?? true);
  const patchConfig = useConfig((s) => s.patch);
  const removeLocal = useProcesses((s) => s.remove);
  const [pending, setPending] = useState<{ app: AppGroup; force: boolean } | null>(null);
  const [dontAsk, setDontAsk] = useState(false);
  const [closing, setClosing] = useState<Set<number>>(new Set());

  const end = async (app: AppGroup, force: boolean) => {
    setClosing((s) => new Set(s).add(app.id));
    const pids = app.processes.map((p) => p.pid);
    try {
      const out = await backend().endApp(pids, app.primary, force);
      const gone = pids.filter((pid) => !out.failed.includes(pid));
      gone.forEach(removeLocal);
      if (out.ended) {
        if (force) toast.success(t('apps.forcedNow', { name: app.name }));
        else if (out.forced > 0) toast.warning(t('apps.forcedAfterTimeout', { name: app.name }));
        else toast.success(t('apps.closed', { name: app.name }));
      } else {
        toast.error(t('apps.partial', { name: app.name, count: out.failed.length }), out.error ?? undefined);
      }
    } catch (e) {
      toast.error(t('apps.failed', { name: app.name }), e);
    } finally {
      setClosing((s) => {
        const next = new Set(s);
        next.delete(app.id);
        return next;
      });
    }
  };

  const requestEnd = (app: AppGroup, force: boolean) => {
    if (closing.has(app.id)) return;
    if (confirmKill) {
      setDontAsk(false);
      setPending({ app, force });
    } else {
      void end(app, force);
    }
  };

  const dialogs = (
    <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
      <AlertDialogContent>
        {pending && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {pending.force ? (
                  <DangerGlyph className="h-5 w-5" />
                ) : (
                  <TriangleAlert className="h-5 w-5 text-warning" />
                )}
                {t(pending.force ? 'apps.confirmForceTitle' : 'apps.confirmEndTitle', {
                  name: pending.app.name,
                })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t(pending.force ? 'apps.confirmForceBody' : 'apps.confirmEndBody', {
                  name: pending.app.name,
                  count: pending.app.processes.length,
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex items-center gap-2">
              <Checkbox id="app-dont-ask" checked={dontAsk} onCheckedChange={(v) => setDontAsk(v === true)} />
              <Label htmlFor="app-dont-ask" className="font-normal text-muted">
                {t('process.dontAskAgain')}
              </Label>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                danger
                onClick={() => {
                  const { app, force } = pending;
                  if (dontAsk) void patchConfig((c) => void (c.processes.confirmKill = false));
                  void end(app, force);
                }}
              >
                {t(pending.force ? 'apps.forceEnd' : 'process.endTask')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );

  return { requestEnd, closing, dialogs };
}
