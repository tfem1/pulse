import { BellOff, BellRing, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { StatusIcon } from '@/components/StatusIcon';
import { Unavailable } from '@/components/Unavailable';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useInterval } from '@/hooks/useInterval';
import { useT } from '@/i18n';
import { formatAlertValue, METRIC_META } from '@/lib/alertMeta';
import { formatDateTime, formatDuration } from '@/lib/format';
import type { AlertMetric, AlertRule } from '@/lib/types';
import { uid } from '@/lib/utils';
import { useAlerts } from '@/stores/alerts';
import { useConfig } from '@/stores/config';
import { useMetrics } from '@/stores/metrics';
import { AlertRuleDialog } from './AlertRuleDialog';

export function AlertsPage() {
  const t = useT();
  const config = useConfig((s) => s.config);
  const patch = useConfig((s) => s.patch);
  const events = useAlerts((s) => s.events);
  const statuses = useAlerts((s) => s.statuses);
  const refreshStatus = useAlerts((s) => s.refreshStatus);
  const clearEvents = useAlerts((s) => s.clear);
  const markRead = useAlerts((s) => s.markRead);
  const snap = useMetrics((s) => s.snapshot);

  const [editing, setEditing] = useState<AlertRule | null>(null);
  const [deleting, setDeleting] = useState<AlertRule | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(markRead, [markRead, events.length]);
  useInterval(() => void refreshStatus().catch(() => {}), 2000);

  const suggestions = useMemo<Partial<Record<AlertMetric, string[]>>>(() => {
    const mounts = snap?.disks?.map((d) => d.mountPoint) ?? [];
    const ifaces = snap?.networks?.map((n) => n.name) ?? [];
    const gpus = snap?.gpus?.map((g) => String(g.index)) ?? [];
    const temps = snap?.sensors?.readings.filter((r) => r.kind === 'temperature').map((r) => r.id) ?? [];
    return {
      diskUsagePercent: mounts,
      netRx: ifaces,
      netTx: ifaces,
      gpuUsage: gpus,
      gpuTemperature: gpus,
      temperature: temps,
    };
  }, [snap]);

  const rules = config?.alerts ?? [];
  const n = config?.notifications;

  const newRule = (): AlertRule => ({
    id: uid('rule'),
    name: t('alerts.newRuleName'),
    enabled: true,
    metric: 'cpuTotal',
    target: null,
    comparator: 'above',
    threshold: n?.cpuThreshold ?? 90,
    durationSecs: 30,
    cooldownSecs: n?.defaultCooldownSecs ?? 300,
    action: 'notify',
  });

  const save = async (rule: AlertRule) => {
    const ok = await patch((c) => {
      const i = c.alerts.findIndex((r) => r.id === rule.id);
      if (i >= 0) c.alerts[i] = rule;
      else c.alerts.push(rule);
    });
    if (ok) setEditing(null);
  };

  return (
    <div className="space-y-gap">
      <PageHeader
        title={t('alerts.title')}
        description={t('alerts.description')}
        actions={
          <Button onClick={() => setEditing(newRule())}>
            <Plus /> {t('alerts.newRule')}
          </Button>
        }
      />

      {n && !n.enabled && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-dashed border-border-strong p-3 text-sm text-muted"
        >
          <BellOff className="h-4 w-4" /> {t('alerts.notificationsOff')}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('alerts.rules')}</CardTitle>
          <Badge variant="muted">{rules.length}</Badge>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {rules.length === 0 ? (
            <Unavailable icon={<BellRing />} title={t('alerts.noRules')} />
          ) : (
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs text-faint">
                <tr>
                  <th className="pb-2 font-medium">{t('alerts.status')}</th>
                  <th className="pb-2 font-medium">{t('alerts.name')}</th>
                  <th className="pb-2 font-medium">{t('alerts.condition')}</th>
                  <th className="pb-2 text-right font-medium">{t('alerts.current')}</th>
                  <th className="pb-2 font-medium">{t('alerts.action')}</th>
                  <th className="pb-2 font-medium">{t('alerts.enabled')}</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => {
                  const st = statuses[r.id];
                  const level = !r.enabled
                    ? 'unknown'
                    : st?.firing
                      ? 'danger'
                      : st?.breaching
                        ? 'warning'
                        : 'ok';
                  const label = !r.enabled
                    ? t('alerts.stateDisabled')
                    : st?.firing
                      ? t('alerts.stateFiring')
                      : st?.breaching
                        ? t('alerts.statePending')
                        : t('alerts.stateOk');
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="py-2">
                        <span className="flex items-center gap-2">
                          <StatusIcon level={level} label={label} />
                          <span className={level === 'danger' ? 'font-semibold' : 'text-muted'}>{label}</span>
                        </span>
                      </td>
                      <td className="py-2 font-medium">{r.name}</td>
                      <td className="py-2 text-muted">
                        {t(METRIC_META[r.metric].labelKey)}
                        {r.target ? ` (${r.target})` : ''} {r.comparator === 'above' ? '>' : '<'}{' '}
                        {formatAlertValue(r.metric, r.threshold)}
                        {r.durationSecs > 0 &&
                          ` · ${t('alerts.forDuration', { duration: formatDuration(r.durationSecs) })}`}
                      </td>
                      <td className="num py-2 text-right">{formatAlertValue(r.metric, st?.lastValue)}</td>
                      <td className="py-2 text-muted">
                        {t(r.action === 'notify' ? 'alerts.actionNotify' : 'alerts.actionLog')}
                      </td>
                      <td className="py-2">
                        <Switch
                          checked={r.enabled}
                          aria-label={t('alerts.toggleRule', { name: r.name })}
                          onCheckedChange={(v) =>
                            void patch((c) => {
                              const x = c.alerts.find((a) => a.id === r.id);
                              if (x) x.enabled = v;
                            })
                          }
                        />
                      </td>
                      <td className="py-2 text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t('common.edit')}
                          onClick={() => setEditing(r)}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t('common.delete')}
                          onClick={() => setDeleting(r)}
                        >
                          <Trash2 />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t('alerts.log')}</CardTitle>
            <CardDescription>{t('alerts.logHint')}</CardDescription>
          </div>
          <Button variant="outline" size="sm" disabled={!events.length} onClick={() => setConfirmClear(true)}>
            {t('alerts.clearLog')}
          </Button>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">{t('alerts.noEvents')}</p>
          ) : (
            <ol className="max-h-96 space-y-1 overflow-auto">
              {[...events].reverse().map((e, i) => (
                <li
                  key={`${e.timestampMs}-${e.ruleId}-${i}`}
                  className="flex items-center gap-3 border-b py-1.5 text-sm last:border-b-0"
                >
                  <StatusIcon level={e.kind === 'fired' ? 'danger' : 'ok'} />
                  <span className="num w-40 shrink-0 text-xs text-faint">
                    {formatDateTime(e.timestampMs)}
                  </span>
                  <span className={e.kind === 'fired' ? 'font-semibold' : 'text-muted'}>{e.ruleName}</span>
                  <span className="text-muted">
                    {e.kind === 'fired' ? t('alerts.fired') : t('alerts.resolved')} ·{' '}
                    <span className="num">{formatAlertValue(e.metric, e.value)}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <AlertRuleDialog
        key={editing?.id ?? 'none'}
        rule={editing}
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        onSave={save}
        suggestions={suggestions}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('alerts.deleteTitle', { name: deleting?.name ?? '' })}</AlertDialogTitle>
            <AlertDialogDescription>{t('alerts.deleteBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              danger
              onClick={() => {
                const id = deleting?.id;
                if (id) void patch((c) => void (c.alerts = c.alerts.filter((r) => r.id !== id)));
              }}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('alerts.clearLog')}</AlertDialogTitle>
            <AlertDialogDescription>{t('alerts.clearLogBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction danger onClick={() => void clearEvents()}>
              {t('alerts.clearLog')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
