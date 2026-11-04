import { ExternalLink, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { KeyValue } from '@/components/KeyValue';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useT } from '@/i18n';
import { backend } from '@/lib/api';
import { formatBytes, formatPercent } from '@/lib/format';
import type { AppInfo } from '@/lib/types';
import { useConfig } from '@/stores/config';
import { useMetrics } from '@/stores/metrics';
import { toast } from '@/stores/toast';
import { SettingRow, SettingsSection } from './SettingRow';

/** Single place to change the repository coordinates. */
export const REPO = 'OWNER/pulse';
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

function newer(latest: string, current: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/^v/, '')
      .split(/[.-]/)
      .map((x) => parseInt(x, 10) || 0);
  const [a, b] = [parse(latest), parse(current)];
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return false;
}

export function AboutTab() {
  const t = useT();
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const self = useMetrics((s) => s.snapshot?.selfUsage);
  const updateCheck = useConfig((s) => s.config?.about.updateCheck ?? false);
  const patch = useConfig((s) => s.patch);

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

  // The only network request Pulse ever makes, and only when enabled.
  const check = async () => {
    if (!info) return;
    setChecking(true);
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (res.status === 404) {
        toast.info(t('about.noReleases'));
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { tag_name?: string; html_url?: string };
      const tag = body.tag_name ?? '';
      if (tag && newer(tag, info.version)) {
        toast.success(t('about.updateAvailable', { version: tag }), body.html_url);
      } else {
        toast.info(t('about.upToDate', { version: info.version }));
      }
    } catch (e) {
      toast.error(t('about.checkFailed'), e);
    } finally {
      setChecking(false);
    }
  };

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

      <SettingsSection title={t('about.updates')} description={t('about.privacy')}>
        <SettingRow id="update-check" label={t('about.updateCheck')} description={t('about.updateCheckHint')}>
          <Switch
            id="update-check"
            checked={updateCheck}
            onCheckedChange={(v) => void patch((c) => void (c.about.updateCheck = v))}
          />
          <Button variant="secondary" size="sm" disabled={!updateCheck || checking} onClick={check}>
            <RefreshCw className={checking ? 'animate-spin' : undefined} /> {t('about.checkNow')}
          </Button>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('about.licenses')} description={t('about.licensesHint')}>
        <KeyValue columns={3} items={LICENSES} />
      </SettingsSection>
    </>
  );
}
