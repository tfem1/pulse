import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useT } from '@/i18n';
import type { MonitoringConfig } from '@/lib/types';
import { useConfig } from '@/stores/config';
import { SettingRow, SettingsSection } from './SettingRow';

const REFRESH = [500, 1000, 2000, 5000, 10000];
const HISTORY = [5, 15, 30, 60];
const SENSOR_EVERY = [1, 2, 5, 10];

export function MonitoringTab() {
  const t = useT();
  const m = useConfig((s) => s.config?.monitoring);
  const patch = useConfig((s) => s.patch);
  if (!m) return null;
  const set = <K extends keyof MonitoringConfig>(k: K, v: MonitoringConfig[K]) =>
    void patch((c) => void (c.monitoring[k] = v));

  return (
    <>
      <SettingsSection title={t('monitoring.sampling')} description={t('monitoring.samplingHint')}>
        <SettingRow id="refresh" label={t('monitoring.refresh')} description={t('monitoring.refreshHint')}>
          <Select value={String(m.refreshMs)} onValueChange={(v) => set('refreshMs', Number(v))}>
            <SelectTrigger id="refresh" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REFRESH.map((ms) => (
                <SelectItem key={ms} value={String(ms)}>
                  {ms < 1000 ? `${ms} ms` : `${ms / 1000} s`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow id="history" label={t('monitoring.history')} description={t('monitoring.historyHint')}>
          <Select value={String(m.historyMinutes)} onValueChange={(v) => set('historyMinutes', Number(v))}>
            <SelectTrigger id="history" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HISTORY.map((min) => (
                <SelectItem key={min} value={String(min)}>
                  {t('monitoring.minutes', { n: min })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('monitoring.metrics')} description={t('monitoring.metricsHint')}>
        <SettingRow id="s-disks" label={t('monitoring.sampleDisks')}>
          <Switch id="s-disks" checked={m.sampleDisks} onCheckedChange={(v) => set('sampleDisks', v)} />
        </SettingRow>
        <SettingRow id="s-net" label={t('monitoring.sampleNetwork')}>
          <Switch id="s-net" checked={m.sampleNetwork} onCheckedChange={(v) => set('sampleNetwork', v)} />
        </SettingRow>
        <SettingRow id="s-gpu" label={t('monitoring.sampleGpu')} description={t('monitoring.sampleGpuHint')}>
          <Switch id="s-gpu" checked={m.sampleGpu} onCheckedChange={(v) => set('sampleGpu', v)} />
        </SettingRow>
        <SettingRow
          id="s-sensors"
          label={t('monitoring.sampleSensors')}
          description={t('monitoring.sampleSensorsHint')}
        >
          <Switch id="s-sensors" checked={m.sampleSensors} onCheckedChange={(v) => set('sampleSensors', v)} />
        </SettingRow>
        <SettingRow id="sensor-every" label={t('monitoring.sensorEvery')}>
          <Select
            value={String(m.sensorEvery)}
            onValueChange={(v) => set('sensorEvery', Number(v))}
            disabled={!m.sampleSensors}
          >
            <SelectTrigger id="sensor-every" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SENSOR_EVERY.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {t('monitoring.everyNSamples', { n })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('monitoring.tray')}>
        <SettingRow
          id="close-tray"
          label={t('monitoring.closeToTray')}
          description={t('monitoring.closeToTrayHint')}
        >
          <Switch id="close-tray" checked={m.closeToTray} onCheckedChange={(v) => set('closeToTray', v)} />
        </SettingRow>
        <SettingRow id="tray-stats" label={t('monitoring.trayStats')}>
          <Switch id="tray-stats" checked={m.trayStats} onCheckedChange={(v) => set('trayStats', v)} />
        </SettingRow>
      </SettingsSection>
    </>
  );
}
