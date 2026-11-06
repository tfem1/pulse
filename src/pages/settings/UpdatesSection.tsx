import { Download, ExternalLink, LoaderCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useT, type TKey } from '@/i18n';
import { backend } from '@/lib/api';
import { formatBytes } from '@/lib/format';
import type { InstallMethod, UpdateInfo } from '@/lib/types';
import { useConfig } from '@/stores/config';
import { toast } from '@/stores/toast';
import { useUpdate, type UpdateStatus } from '@/stores/update';
import { SettingRow, SettingsSection } from './SettingRow';

const METHOD_KEYS: Record<Exclude<InstallMethod, 'unsupported'>, TKey> = {
  windowsSetup: 'about.method.windowsSetup',
  windowsMsi: 'about.method.windowsMsi',
  appImage: 'about.method.appImage',
  deb: 'about.method.deb',
};

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/** Settings → About → Updates: check GitHub and update Pulse in place. */
export function UpdatesSection({ version }: { version: string | null }) {
  const t = useT();
  const status = useUpdate((s) => s.status);
  const check = useUpdate((s) => s.check);
  const install = useUpdate((s) => s.install);
  const autoCheck = useConfig((s) => s.config?.about.updateCheck ?? false);
  const patch = useConfig((s) => s.patch);

  const busy = status.kind === 'checking' || status.kind === 'installing';
  const open = (url: string) =>
    backend()
      .openUrl(url)
      .catch((e) => toast.error(t('about.openFailed'), e));

  return (
    <SettingsSection title={t('about.updates')} description={t('about.privacy')}>
      <SettingRow label={t('about.currentVersion', { version: version ?? '—' })}>
        <Button variant="secondary" size="sm" disabled={busy || !version} onClick={() => void check()}>
          <RefreshCw className={status.kind === 'checking' ? 'animate-spin' : undefined} />
          {status.kind === 'checking' ? t('about.checking') : t('about.checkForUpdates')}
        </Button>
      </SettingRow>

      {status.kind !== 'idle' && status.kind !== 'checking' && (
        <div className="py-3" role="status" aria-live="polite">
          <StatusBody status={status} onInstall={() => void install()} onOpen={open} />
        </div>
      )}

      <SettingRow id="update-auto-check" label={t('about.autoCheck')} description={t('about.autoCheckHint')}>
        <Switch
          id="update-auto-check"
          checked={autoCheck}
          onCheckedChange={(v) => void patch((c) => void (c.about.updateCheck = v))}
        />
      </SettingRow>
    </SettingsSection>
  );
}

function StatusBody({
  status,
  onInstall,
  onOpen,
}: {
  status: Exclude<UpdateStatus, { kind: 'idle' | 'checking' }>;
  onInstall: () => void;
  onOpen: (url: string) => void;
}) {
  const t = useT();

  if (status.kind === 'noReleases') return <p className="text-sm text-muted">{t('about.noReleases')}</p>;
  if (status.kind === 'error')
    return (
      <div className="text-sm">
        <p className="font-medium">{t('about.checkFailed')}</p>
        <p className="selectable mt-0.5 text-xs text-muted">{status.message}</p>
      </div>
    );

  const info = status.info;
  if (!info.available) return <p className="text-sm">{t('about.upToDate', { version: info.current })}</p>;

  if (status.kind === 'installing') return <Progress info={info} status={status} />;

  const whatsNew = (
    <Button variant="outline" size="sm" onClick={() => onOpen(info.releaseUrl)}>
      <ExternalLink /> {t('about.whatsNew')}
    </Button>
  );

  return (
    <div className="space-y-3">
      <div className="text-sm">
        <p className="font-semibold">{t('about.updateAvailable', { version: info.latest })}</p>
        {info.asset && (
          <p className="mt-0.5 text-xs text-muted">
            {t('about.updateSize', {
              size: formatBytes(info.asset.size),
              date: formatDate(info.publishedAt),
            })}
          </p>
        )}
        {info.method !== 'unsupported' && info.asset ? (
          <p className="mt-1 text-xs text-muted">{t(METHOD_KEYS[info.method])}</p>
        ) : (
          info.unsupportedReason && <p className="mt-1 text-xs text-muted">{info.unsupportedReason}</p>
        )}
      </div>
      {status.kind === 'installFailed' && (
        <div className="rounded-md border-2 border-danger p-2 text-sm" role="alert">
          <p className="font-medium">{t('about.updateFailed')}</p>
          <p className="selectable mt-0.5 text-xs text-muted">{status.message}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {info.method !== 'unsupported' && info.asset ? (
          <Button size="sm" onClick={onInstall}>
            <Download /> {t('about.updateNow')}
          </Button>
        ) : (
          <Button size="sm" onClick={() => onOpen(info.releaseUrl)}>
            <ExternalLink /> {t('about.openDownloads')}
          </Button>
        )}
        {whatsNew}
      </div>
    </div>
  );
}

function Progress({
  info,
  status,
}: {
  info: UpdateInfo;
  status: Extract<UpdateStatus, { kind: 'installing' }>;
}) {
  const t = useT();
  const p = status.progress;
  const phase = p?.phase ?? 'download';
  const percent = p && p.total > 0 ? Math.min(100, Math.round((p.downloaded / p.total) * 100)) : 0;
  const label =
    phase === 'download'
      ? t('about.downloading', { version: info.latest, percent })
      : phase === 'install'
        ? info.method === 'deb'
          ? t('about.installingDeb')
          : t('about.installing')
        : t('about.restarting');

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-sm font-medium">
        <LoaderCircle className="size-4 animate-spin" aria-hidden /> {label}
      </p>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={phase === 'download' ? percent : 100}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-hover"
      >
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${phase === 'download' ? percent : 100}%` }}
        />
      </div>
    </div>
  );
}
