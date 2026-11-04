import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useT, type TKey } from '@/i18n';
import type { ProcessConfig, ProcessSortKey } from '@/lib/types';
import { useConfig } from '@/stores/config';
import { SettingRow, SettingsSection } from './SettingRow';

const SORTS: [ProcessSortKey, TKey][] = [
  ['cpu', 'process.cpu'],
  ['memory', 'process.memory'],
  ['disk', 'process.disk'],
  ['name', 'process.name'],
  ['pid', 'process.pid'],
  ['user', 'process.user'],
  ['status', 'process.status'],
  ['threads', 'process.threads'],
];

export function ProcessesTab() {
  const t = useT();
  const p = useConfig((s) => s.config?.processes);
  const patch = useConfig((s) => s.patch);
  if (!p) return null;
  const set = <K extends keyof ProcessConfig>(k: K, v: ProcessConfig[K]) =>
    void patch((c) => void (c.processes[k] = v));

  return (
    <SettingsSection title={t('settings.processes')} description={t('processesSettings.hint')}>
      <SettingRow id="default-sort" label={t('processesSettings.defaultSort')}>
        <Select value={p.defaultSort} onValueChange={(v) => set('defaultSort', v as ProcessSortKey)}>
          <SelectTrigger id="default-sort" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map(([k, label]) => (
              <SelectItem key={k} value={k}>
                {t(label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ToggleGroup
          type="single"
          value={p.sortDescending ? 'desc' : 'asc'}
          onValueChange={(v) => v && set('sortDescending', v === 'desc')}
          aria-label={t('processesSettings.direction')}
        >
          <ToggleGroupItem value="desc">{t('processesSettings.descending')}</ToggleGroupItem>
          <ToggleGroupItem value="asc">{t('processesSettings.ascending')}</ToggleGroupItem>
        </ToggleGroup>
      </SettingRow>
      <SettingRow
        id="confirm-kill"
        label={t('processesSettings.confirmKill')}
        description={t('processesSettings.confirmKillHint')}
      >
        <Switch id="confirm-kill" checked={p.confirmKill} onCheckedChange={(v) => set('confirmKill', v)} />
      </SettingRow>
      <SettingRow
        id="show-system"
        label={t('processes.showSystem')}
        description={t('processesSettings.showSystemHint')}
      >
        <Switch id="show-system" checked={p.showSystem} onCheckedChange={(v) => set('showSystem', v)} />
      </SettingRow>
      <SettingRow id="tree-view" label={t('processesSettings.treeDefault')}>
        <Switch id="tree-view" checked={p.treeView} onCheckedChange={(v) => set('treeView', v)} />
      </SettingRow>
    </SettingsSection>
  );
}
