import { ArrowDown, ArrowUp, Bell, Contrast, Pause, Play } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { MOD_KEY, NAV } from '@/app/nav';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
import { formatPercent, formatRate } from '@/lib/format';
import { cn, percent } from '@/lib/utils';
import { useAlerts } from '@/stores/alerts';
import { useAppearance } from '@/stores/appearance';
import { useMetrics } from '@/stores/metrics';
import { THEMES, type ThemeChoice } from '@/theme/themes';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="hidden items-baseline gap-1.5 md:flex">
      <span className="text-[11px] uppercase tracking-wide text-faint">{label}</span>
      <span className="num text-sm font-semibold">{value}</span>
    </div>
  );
}

export function TopBar() {
  const t = useT();
  const location = useLocation();
  const navigate = useNavigate();
  const snap = useMetrics((s) => s.snapshot);
  const paused = useMetrics((s) => s.paused);
  const setPaused = useMetrics((s) => s.setPaused);
  const theme = useAppearance((s) => s.theme);
  const setTheme = useAppearance((s) => s.setTheme);
  const unread = useAlerts((s) => s.unread);

  const current = NAV.find((n) => location.pathname.startsWith(n.path));
  const title = current ? t(current.labelKey) : 'Pulse';

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b bg-bg-elevated px-page">
      <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h2>

      <div className="flex items-center gap-5" aria-live="off">
        <Stat label={t('metric.cpu')} value={formatPercent(snap?.cpu.total)} />
        <Stat
          label={t('metric.memory')}
          value={formatPercent(snap ? percent(snap.memory.used, snap.memory.total) : null)}
        />
        <div className="hidden items-center gap-3 lg:flex">
          <span className="num flex items-center gap-1 text-sm">
            <ArrowDown className="h-3.5 w-3.5 text-faint" aria-label={t('metric.download')} />
            {formatRate(snap?.netRxBps)}
          </span>
          <span className="num flex items-center gap-1 text-sm">
            <ArrowUp className="h-3.5 w-3.5 text-faint" aria-label={t('metric.upload')} />
            {formatRate(snap?.netTxBps)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Tooltip label={`${paused ? t('topbar.resume') : t('topbar.pause')} · ${MOD_KEY}+Shift+P`}>
          <Button
            variant={paused ? 'secondary' : 'ghost'}
            size="icon"
            onClick={() => setPaused(!paused)}
            aria-pressed={paused}
            aria-label={paused ? t('topbar.resume') : t('topbar.pause')}
            className={cn(paused && 'border-2')}
          >
            {paused ? <Play /> : <Pause />}
          </Button>
        </Tooltip>

        <DropdownMenu>
          <Tooltip label={t('topbar.theme')}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t('topbar.theme')}>
                <Contrast />
              </Button>
            </DropdownMenuTrigger>
          </Tooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t('topbar.theme')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemeChoice)}>
              <DropdownMenuRadioItem value="system">{t('appearance.followSystem')}</DropdownMenuRadioItem>
              {THEMES.map((th) => (
                <DropdownMenuRadioItem key={th.id} value={th.id}>
                  {th.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip label={t('nav.alerts')}>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/alerts')}
            aria-label={unread ? t('topbar.alertsUnread', { count: unread }) : t('nav.alerts')}
            className="relative"
          >
            <Bell />
            {unread > 0 && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger ring-2 ring-bg-elevated" />
            )}
          </Button>
        </Tooltip>
      </div>
    </header>
  );
}
