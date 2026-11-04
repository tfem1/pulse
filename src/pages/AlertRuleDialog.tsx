import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useT } from '@/i18n';
import { METRIC_META } from '@/lib/alertMeta';
import { ALERT_METRICS, type AlertMetric, type AlertRule } from '@/lib/types';

export function AlertRuleDialog({
  rule,
  open,
  onOpenChange,
  onSave,
  suggestions,
}: {
  rule: AlertRule | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSave: (r: AlertRule) => void;
  /** Known targets per metric (mount points, interfaces...) for the datalist. */
  suggestions: Partial<Record<AlertMetric, string[]>>;
}) {
  const t = useT();
  // The parent remounts this component (via `key`) for each rule edited.
  const [draft, setDraft] = useState<AlertRule | null>(rule);
  if (!draft) return null;

  const meta = METRIC_META[draft.metric];
  const set = <K extends keyof AlertRule>(k: K, v: AlertRule[K]) => setDraft({ ...draft, [k]: v });
  const valid = draft.name.trim().length > 0 && Number.isFinite(draft.threshold);
  const listId = `targets-${draft.metric}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('alerts.editRule')}</DialogTitle>
          <DialogDescription>{t('alerts.ruleHint')}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) onSave({ ...draft, name: draft.name.trim(), target: draft.target?.trim() || null });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="rule-name">{t('alerts.name')}</Label>
            <Input
              id="rule-name"
              value={draft.name}
              onChange={(e) => set('name', e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rule-metric">{t('alerts.metric')}</Label>
            <Select
              value={draft.metric}
              onValueChange={(v) => {
                const m = v as AlertMetric;
                setDraft({ ...draft, metric: m, threshold: METRIC_META[m].defaultThreshold, target: null });
              }}
            >
              <SelectTrigger id="rule-metric">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALERT_METRICS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {t(METRIC_META[m].labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {meta.targetKey && (
            <div className="grid gap-1.5">
              <Label htmlFor="rule-target">{t(meta.targetKey)}</Label>
              <Input
                id="rule-target"
                list={listId}
                value={draft.target ?? ''}
                placeholder={t('alerts.targetAny')}
                onChange={(e) => set('target', e.target.value)}
              />
              <datalist id={listId}>
                {(suggestions[draft.metric] ?? []).map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
          )}
          <div className="grid grid-cols-[auto_1fr] items-end gap-3">
            <div className="grid gap-1.5">
              <Label>{t('alerts.condition')}</Label>
              <ToggleGroup
                type="single"
                value={draft.comparator}
                onValueChange={(v) => v && set('comparator', v as AlertRule['comparator'])}
              >
                <ToggleGroupItem value="above">{t('alerts.above')}</ToggleGroupItem>
                <ToggleGroupItem value="below">{t('alerts.below')}</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rule-threshold">
                {t('alerts.threshold')} ({meta.unit})
              </Label>
              <Input
                id="rule-threshold"
                type="number"
                step="any"
                min={0}
                max={meta.max}
                value={Number.isFinite(draft.threshold) ? draft.threshold : ''}
                onChange={(e) => set('threshold', e.target.valueAsNumber)}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="rule-duration">{t('alerts.duration')}</Label>
              <Input
                id="rule-duration"
                type="number"
                min={0}
                max={3600}
                value={draft.durationSecs}
                onChange={(e) => set('durationSecs', Math.max(0, e.target.valueAsNumber || 0))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rule-cooldown">{t('alerts.cooldown')}</Label>
              <Input
                id="rule-cooldown"
                type="number"
                min={0}
                max={86400}
                value={draft.cooldownSecs}
                onChange={(e) => set('cooldownSecs', Math.max(0, e.target.valueAsNumber || 0))}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>{t('alerts.action')}</Label>
            <ToggleGroup
              type="single"
              value={draft.action}
              onValueChange={(v) => v && set('action', v as AlertRule['action'])}
            >
              <ToggleGroupItem value="notify">{t('alerts.actionNotify')}</ToggleGroupItem>
              <ToggleGroupItem value="log">{t('alerts.actionLog')}</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="rule-enabled" checked={draft.enabled} onCheckedChange={(v) => set('enabled', v)} />
            <Label htmlFor="rule-enabled" className="font-normal">
              {t('alerts.enabled')}
            </Label>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!valid}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
