import { Bell, Database, Gauge, Info, ListTree, Palette } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { useT, type TKey } from '@/i18n';
import { cn } from '@/lib/utils';
import { useConfig } from '@/stores/config';

const TABS: { to: string; labelKey: TKey; icon: typeof Palette }[] = [
  { to: 'appearance', labelKey: 'settings.appearance', icon: Palette },
  { to: 'monitoring', labelKey: 'settings.monitoring', icon: Gauge },
  { to: 'processes', labelKey: 'settings.processes', icon: ListTree },
  { to: 'notifications', labelKey: 'settings.notifications', icon: Bell },
  { to: 'data', labelKey: 'settings.data', icon: Database },
  { to: 'about', labelKey: 'settings.about', icon: Info },
];

export function SettingsLayout() {
  const t = useT();
  const saving = useConfig((s) => s.saving);
  return (
    <div>
      <PageHeader
        title={t('settings.title')}
        description={t('settings.description')}
        actions={saving ? <span className="text-xs text-muted">{t('settings.saving')}</span> : undefined}
      />
      <div className="grid gap-gap md:grid-cols-[200px_1fr]">
        <nav aria-label={t('settings.sections')} className="flex gap-1 overflow-x-auto md:flex-col">
          {TABS.map(({ to, labelKey, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex h-9 shrink-0 items-center gap-2.5 rounded-md border border-transparent px-3 text-sm transition-colors',
                  isActive
                    ? 'border-border-strong bg-surface font-semibold text-fg'
                    : 'text-muted hover:bg-surface-hover hover:text-fg',
                )
              }
            >
              <Icon className="h-4 w-4" />
              {t(labelKey)}
            </NavLink>
          ))}
        </nav>
        <section className="min-w-0 space-y-gap">
          <Outlet />
        </section>
      </div>
    </div>
  );
}
