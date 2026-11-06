import { ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { KeyValue } from '@/components/KeyValue';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';
import { backend } from '@/lib/api';
import { formatBytes, formatPercent } from '@/lib/format';
import type { AppInfo } from '@/lib/types';
import { useMetrics } from '@/stores/metrics';
import { toast } from '@/stores/toast';
import { SettingsSection } from './SettingRow';
import { UpdatesSection } from './UpdatesSection';

/** Single place to change the repository coordinates. */
export const REPO = 'tfem1/pulse';
const REPO_URL = `https://github.com/${REPO}`;

const LICENSES: [string, string][] = [
  ['Tauri', 'MIT / Apache-2.0'],
  ['sysinfo', 'MIT'],
  ['nvml-wrapper', 'MIT / Apache-2.0'],
  ['wmi', 'MIT / Apache-2.0'],
  ['windows-rs', 'MIT / Apache-2.0'],
  ['serde', 'MIT / Apache-2.0'],
  ['chrono', 'MIT / Apache-2.0'],
  ['React', 'MIT'],
  ['React Router', 'MIT'],
  ['Radix UI', 'MIT'],
  ['shadcn/ui', 'MIT'],
  ['Tailwind CSS', 'MIT'],
  ['uPlot', 'MIT'],
  ['Zustand', 'MIT'],
  ['Lucide', 'ISC'],
];

export function AboutTab() {
  const t = useT();
  const [info, setInfo] = useState<AppInfo | null>(null);
  const self = useMetrics((s) => s.snapshot?.selfUsage);

  useEffect(() => {
    backend()
      .getAppInfo()
      .then(setInfo)
      .catch(() => {});
  }, []);

  const open = (url: string) =>
    backend()
      .openUrl(url)
      .catch((e) => toast.error(t('about.openFailed'), e));

  return (
    <>
      <SettingsSection title="Pulse" description={t('about.tagline')}>
        <KeyValue
          items={[
            [t('about.version'), info?.version ?? '—'],
            [t('about.tauri'), info?.tauriVersion ?? '—'],
            [t('about.platform'), info ? `${info.targetOs} · ${info.targetArch}` : '—'],
            [t('about.build'), info ? (info.debug ? t('about.debug') : t('about.release')) : '—'],
            [t('about.selfCpu'), formatPercent(self?.cpuPercent, 1)],
            [t('about.selfMemory'), formatBytes(self?.memoryBytes)],
            [t('about.tray'), info ? (info.trayAvailable ? t('common.yes') : t('common.no')) : '—'],
            [t('about.license'), 'MIT'],
          ]}
        />
        <div className="flex flex-wrap gap-2 pt-4">
          <Button variant="outline" size="sm" onClick={() => open(REPO_URL)}>
            <ExternalLink /> {t('about.repository')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => open(`${REPO_URL}/issues`)}>
            <ExternalLink /> {t('about.reportIssue')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => open(`${REPO_URL}/releases`)}>
            <ExternalLink /> {t('about.releases')}
          </Button>
        </div>
      </SettingsSection>

      <UpdatesSection version={info?.version ?? null} />

      <SettingsSection title={t('about.licenses')} description={t('about.licensesHint')}>
        <KeyValue columns={3} items={LICENSES} />
      </SettingsSection>
    </>
  );
}
