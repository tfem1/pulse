import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NavLink } from 'react-router';
import { MOD_KEY, NAV } from '@/app/nav';
import { Badge } from '@/components/ui/badge';
import { Tooltip } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useAlerts } from '@/stores/alerts';
import { useAppearance } from '@/stores/appearance';
import { useMetrics } from '@/stores/metrics';

export function Sidebar() {
  const t = useT();
  const collapsed = useAppearance((s) => s.sidebarCollapsed);
  const toggle = useAppearance((s) => s.toggleSidebar);
  const info = useMetrics((s) => s.systemInfo);
  const uptime = useMetrics((s) => s.snapshot?.uptimeSecs);
  const isDemo = useMetrics((s) => s.isDemo);
  const unread = useAlerts((s) => s.unread);

  return (
    <aside
      aria-label={t('nav.label')}
      className={cn(
        'flex h-full shrink-0 flex-col border-r bg-bg-elevated transition-[width] duration-200',
        collapsed ? 'w-[60px]' : 'w-[220px]',
      )}
    >
      <div className={cn('flex h-14 items-center gap-2.5 border-b px-4', collapsed && 'justify-center px-0')}>
        <img src="/pulse.svg" alt="" className="h-7 w-7" />
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-bold tracking-tight">Pulse</p>
            <p className="truncate text-[11px] text-faint">{info?.hostname ?? '—'}</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {NAV.map((item, i) => {
          const Icon = item.icon;
          const label = t(item.labelKey);
          const link = (
            <NavLink
              key={item.path}
              to={item.path}
              aria-label={collapsed ? label : undefined}
              aria-keyshortcuts={`Control+${i + 1}`}
              className={({ isActive }) =>
                cn(
                  'group relative flex h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors',
                  collapsed && 'justify-center px-0',
                  isActive
                    ? 'bg-surface font-semibold text-fg shadow-card before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-fg'
                    : 'text-muted hover:bg-surface-hover hover:text-fg',
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="flex-1 truncate">{label}</span>}
              {item.path === '/alerts' && unread > 0 && (
                <Badge variant="danger" className={cn(collapsed && 'absolute right-1 top-0.5 px-1')}>
                  {unread}
                </Badge>
              )}
              {!collapsed && item.path !== '/alerts' && (
                <kbd className="hidden text-[10px] text-faint group-hover:inline">
                  {MOD_KEY}
                  {i + 1}
                </kbd>
              )}
            </NavLink>
          );
          return collapsed ? (
            <Tooltip key={item.path} side="right" label={`${label} · ${MOD_KEY}+${i + 1}`}>
              {link}
            </Tooltip>
          ) : (
            link
          );
        })}
      </nav>

      <div className="border-t p-2">
        {!collapsed && (
          <div className="mb-2 space-y-1 px-2 text-[11px] text-faint">
            {isDemo && (
              <Badge variant="warning" className="mb-1">
                {t('app.demoBadge')}
              </Badge>
            )}
            <p className="num">
              {t('app.uptime')}: {formatDuration(uptime)}
            </p>
          </div>
        )}
        <Tooltip side="right" label={`${collapsed ? t('nav.expand') : t('nav.collapse')} · ${MOD_KEY}+B`}>
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
            aria-expanded={!collapsed}
            className="flex h-8 w-full items-center justify-center gap-2 rounded-md text-xs text-muted hover:bg-surface-hover hover:text-fg"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {!collapsed && t('nav.collapse')}
          </button>
        </Tooltip>
      </div>
    </aside>
  );
}
