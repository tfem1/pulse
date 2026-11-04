import { Copy } from 'lucide-react';
import { KeyValue } from '@/components/KeyValue';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useT } from '@/i18n';
import {
  formatBytes,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatPercent,
  formatRate,
} from '@/lib/format';
import type { ProcessInfo } from '@/lib/types';
import { toast } from '@/stores/toast';
import { statusLabel } from './status';

export function ProcessDetailsDialog({
  process: p,
  parentName,
  onOpenChange,
}: {
  process: ProcessInfo | null;
  parentName?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.info(t('common.copied'));
    } catch {
      toast.error(t('common.copyFailed'));
    }
  };
  return (
    <Dialog open={!!p} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" closeLabel={t('common.close')}>
        {p && (
          <>
            <DialogHeader>
              <DialogTitle>{p.name}</DialogTitle>
              <DialogDescription>
                PID {p.pid}
                {p.isSystem ? ` · ${t('process.system')}` : ''}
              </DialogDescription>
            </DialogHeader>
            <KeyValue
              items={[
                [t('process.status'), statusLabel(t, p.status)],
                [t('process.user'), p.user ?? '—'],
                [t('process.parent'), p.parent != null ? `${parentName ?? '?'} (${p.parent})` : '—'],
                [t('process.threads'), formatNumber(p.threads)],
                [t('process.cpu'), formatPercent(p.cpu, 1)],
                [t('process.memory'), formatBytes(p.memory)],
                [t('process.virtualMemory'), formatBytes(p.virtualMemory)],
                [t('process.diskRead'), formatRate(p.diskReadBps)],
                [t('process.diskWrite'), formatRate(p.diskWriteBps)],
                [t('process.started'), p.startTime ? formatDateTime(p.startTime * 1000) : '—'],
                [t('process.runTime'), formatDuration(p.runTime)],
              ]}
            />
            {[
              [t('process.executable'), p.exe],
              [t('process.commandLine'), p.cmd],
            ].map(([label, value]) => (
              <div key={label as string}>
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-medium text-muted">{label}</p>
                  {value && (
                    <Button variant="ghost" size="sm" onClick={() => copy(value)}>
                      <Copy /> {t('common.copy')}
                    </Button>
                  )}
                </div>
                <pre className="selectable max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-bg p-2 font-mono text-xs">
                  {value || '—'}
                </pre>
              </div>
            ))}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
