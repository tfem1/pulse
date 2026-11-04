import { Download, FolderOpen, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
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
import { useT } from '@/i18n';
import { backend } from '@/lib/api';
import { formatDuration, formatNumber } from '@/lib/format';
import type { AppPaths, ExportFormat } from '@/lib/types';
import { useConfig } from '@/stores/config';
import { useMetrics } from '@/stores/metrics';
import { toast } from '@/stores/toast';
import { SettingRow, SettingsSection } from './SettingRow';

export function DataTab() {
  const t = useT();
  const [paths, setPaths] = useState<AppPaths | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const clearLocal = useMetrics((s) => s.clear);
  const samples = useMetrics((s) => s.bank.length);
  const m = useConfig((s) => s.config?.monitoring);

  useEffect(() => {
    backend()
      .getPaths()
      .then(setPaths)
      .catch(() => setPaths(null));
  }, []);

  const exportAs = async (format: ExportFormat) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    try {
      const path = await backend().pickSavePath(`pulse-metrics-${stamp}.${format}`, format);
      if (!path) return;
      setBusy(true);
      const n = await backend().exportMetrics(path, format);
      toast.success(t('data.exported', { count: formatNumber(n) }), path);
    } catch (e) {
      toast.error(t('data.exportFailed'), e);
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    try {
      await backend().clearHistory();
      clearLocal();
      toast.success(t('data.cleared'));
    } catch (e) {
      toast.error(t('data.clearFailed'), e);
    }
  };

  return (
    <>
      <SettingsSection title={t('data.export')} description={t('data.exportHint')}>
        <SettingRow
          label={t('data.exportHistory')}
          description={t('data.historySize', {
            count: formatNumber(samples),
            window: formatDuration(m ? (samples * m.refreshMs) / 1000 : 0),
          })}
        >
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => exportAs('csv')}>
            <Download /> CSV
          </Button>
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => exportAs('json')}>
            <Download /> JSON
          </Button>
        </SettingRow>
        <SettingRow label={t('data.clearHistory')} description={t('data.clearHistoryHint')}>
          <Button variant="danger" size="sm" onClick={() => setConfirm(true)}>
            <Trash2 /> {t('data.clear')}
          </Button>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('data.configuration')} description={t('data.configurationHint')}>
        <SettingRow
          label={t('data.configFile')}
          description={<code className="selectable break-all font-mono">{paths?.configFile ?? '—'}</code>}
        >
          <Button
            variant="outline"
            size="sm"
            disabled={!paths}
            onClick={() =>
              paths &&
              backend()
                .revealPath(paths.configFile)
                .catch((e) => toast.error(t('data.openFailed'), e))
            }
          >
            <FolderOpen /> {t('data.showInFolder')}
          </Button>
        </SettingRow>
        <p className="pt-3 text-xs text-muted">{t('data.appearanceNote')}</p>
      </SettingsSection>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('data.clearHistory')}</AlertDialogTitle>
            <AlertDialogDescription>{t('data.clearConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction danger onClick={clear}>
              {t('data.clear')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
