import { BellRing, Plus } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useT } from '@/i18n';
import { backend } from '@/lib/api';
import type { AlertRule, NotificationConfig } from '@/lib/types';
import { uid } from '@/lib/utils';
import { useConfig } from '@/stores/config';
import { toast } from '@/stores/toast';
import { SettingRow, SettingsSection } from './SettingRow';

export function NotificationsTab() {
  const t = useT();
  const navigate = useNavigate();
  const n = useConfig((s) => s.config?.notifications);
  const patch = useConfig((s) => s.patch);
  if (!n) return null;
  const set = <K extends keyof NotificationConfig>(k: K, v: NotificationConfig[K]) =>
    void patch((c) => void (c.notifications[k] = v));

  const num = (
    k: 'cpuThreshold' | 'memoryThreshold' | 'temperatureThreshold' | 'defaultCooldownSecs',
    max: number,
  ) => (
    <Input
      id={k}
      type="number"
      min={1}
      max={max}
      className="w-24"
      defaultValue={n[k]}
      key={n[k]}
      onBlur={(e) => {
        const v = e.target.valueAsNumber;
        if (Number.isFinite(v) && v !== n[k]) set(k, Math.min(max, Math.max(1, v)));
      }}
    />
  );

  const createDefaults = async () => {
    const make = (
      name: string,
      metric: AlertRule['metric'],
      threshold: number,
      durationSecs: number,
    ): AlertRule => ({
      id: uid('rule'),
      name,
      enabled: true,
      metric,
      target: null,
      comparator: 'above',
      threshold,
      durationSecs,
      cooldownSecs: n.defaultCooldownSecs,
      action: 'notify',
    });
    const ok = await patch((c) => {
      c.alerts.push(
        make(t('notifications.ruleCpu'), 'cpuTotal', n.cpuThreshold, 30),
        make(t('notifications.ruleMemory'), 'memoryPercent', n.memoryThreshold, 15),
        make(t('notifications.ruleTemp'), 'temperature', n.temperatureThreshold, 10),
      );
    });
    if (ok) {
      toast.success(t('notifications.rulesCreated'));
      navigate('/alerts');
    }
  };

  return (
    <>
      <SettingsSection title={t('notifications.desktop')}>
        <SettingRow
          id="notif-enabled"
          label={t('notifications.enable')}
          description={t('notifications.enableHint')}
        >
          <Switch id="notif-enabled" checked={n.enabled} onCheckedChange={(v) => set('enabled', v)} />
        </SettingRow>
        <SettingRow label={t('notifications.test')} description={t('notifications.testHint')}>
          <Button
            variant="secondary"
            size="sm"
            disabled={!n.enabled}
            onClick={() =>
              backend()
                .sendTestNotification('Pulse', t('notifications.testBody'))
                .then(() => toast.success(t('notifications.testSent')))
                .catch((e) => toast.error(t('notifications.testFailed'), e))
            }
          >
            <BellRing /> {t('notifications.sendTest')}
          </Button>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('notifications.quietHours')} description={t('notifications.quietHoursHint')}>
        <SettingRow id="quiet" label={t('notifications.quietEnable')}>
          <Switch
            id="quiet"
            checked={n.quietHoursEnabled}
            onCheckedChange={(v) => set('quietHoursEnabled', v)}
          />
        </SettingRow>
        <SettingRow id="quiet-start" label={t('notifications.from')}>
          <Input
            id="quiet-start"
            type="time"
            className="w-32"
            value={n.quietStart}
            disabled={!n.quietHoursEnabled}
            onChange={(e) => e.target.value && set('quietStart', e.target.value)}
          />
        </SettingRow>
        <SettingRow id="quiet-end" label={t('notifications.to')}>
          <Input
            id="quiet-end"
            type="time"
            className="w-32"
            value={n.quietEnd}
            disabled={!n.quietHoursEnabled}
            onChange={(e) => e.target.value && set('quietEnd', e.target.value)}
          />
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('notifications.thresholds')} description={t('notifications.thresholdsHint')}>
        <SettingRow id="cpuThreshold" label={t('notifications.cpuThreshold')}>
          {num('cpuThreshold', 100)} <span className="text-sm text-muted">%</span>
        </SettingRow>
        <SettingRow id="memoryThreshold" label={t('notifications.memoryThreshold')}>
          {num('memoryThreshold', 100)} <span className="text-sm text-muted">%</span>
        </SettingRow>
        <SettingRow id="temperatureThreshold" label={t('notifications.temperatureThreshold')}>
          {num('temperatureThreshold', 150)} <span className="text-sm text-muted">°C</span>
        </SettingRow>
        <SettingRow
          id="defaultCooldownSecs"
          label={t('notifications.cooldown')}
          description={t('notifications.cooldownHint')}
        >
          {num('defaultCooldownSecs', 86400)} <span className="text-sm text-muted">s</span>
        </SettingRow>
        <div className="pt-3">
          <Button variant="outline" size="sm" onClick={createDefaults}>
            <Plus /> {t('notifications.createRules')}
          </Button>
        </div>
      </SettingsSection>
    </>
  );
}
