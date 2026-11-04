import { Check, MonitorCog } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { useAppearance, type Accent, type Density, type Language } from '@/stores/appearance';
import { useResolvedTheme } from '@/theme/useResolvedTheme';
import { THEMES, type ThemeId, type ThemeMeta } from '@/theme/themes';
import { SettingRow, SettingsSection } from './SettingRow';

/** Miniature app mockup drawn with the theme's own swatches. */
function MiniMockup({ p }: { p: ThemeMeta['preview'] }) {
  return (
    <svg viewBox="0 0 160 96" className="block h-auto w-full" aria-hidden>
      <rect width="160" height="96" fill={p.bg} />
      <rect width="34" height="96" fill={p.surface} />
      <line x1="34" y1="0" x2="34" y2="96" stroke={p.border} />
      {[14, 24, 34, 44].map((y, i) => (
        <rect
          key={y}
          x="7"
          y={y}
          width={i === 0 ? 20 : 16}
          height="4"
          rx="2"
          fill={i === 0 ? p.text : p.muted}
        />
      ))}
      <rect x="42" y="8" width="52" height="30" rx="4" fill={p.surface} stroke={p.border} />
      <rect x="100" y="8" width="52" height="30" rx="4" fill={p.surface} stroke={p.border} />
      <rect x="48" y="14" width="22" height="4" rx="2" fill={p.muted} />
      <rect x="48" y="24" width="32" height="7" rx="2" fill={p.text} />
      <rect x="106" y="14" width="22" height="4" rx="2" fill={p.muted} />
      <rect x="106" y="24" width="28" height="7" rx="2" fill={p.text} />
      <rect x="42" y="44" width="110" height="44" rx="4" fill={p.surface} stroke={p.border} />
      <polyline
        points="48,78 62,70 74,74 88,58 102,64 116,52 130,60 146,50"
        fill="none"
        stroke={p.chartA}
        strokeWidth="2"
      />
      <polyline
        points="48,82 62,80 74,76 88,78 102,72 116,74 130,70 146,72"
        fill="none"
        stroke={p.chartB}
        strokeWidth="1.5"
        strokeDasharray="4 2"
      />
    </svg>
  );
}

function ThemeCard({ theme, active, onSelect }: { theme: ThemeMeta; active: boolean; onSelect: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={cn(
        'group overflow-hidden rounded-lg border text-left transition-colors hover:border-border-strong',
        active && 'border-2 border-fg',
      )}
    >
      <MiniMockup p={theme.preview} />
      <div className="flex items-center justify-between gap-2 border-t bg-surface px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{theme.name}</p>
          <p className="truncate text-[11px] text-muted">{t(theme.descriptionKey)}</p>
        </div>
        {active && (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-fg text-bg">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </span>
        )}
      </div>
    </button>
  );
}

export function AppearanceTab() {
  const t = useT();
  const a = useAppearance();
  const resolved = useResolvedTheme();
  const darkThemes = THEMES.filter((th) => th.dark);
  const lightThemes = THEMES.filter((th) => !th.dark);

  return (
    <>
      <SettingsSection title={t('appearance.theme')} description={t('appearance.themeHint')}>
        <div className="space-y-4">
          <div
            role="radiogroup"
            aria-label={t('appearance.theme')}
            className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-4"
          >
            <button
              type="button"
              role="radio"
              aria-checked={a.theme === 'system'}
              onClick={() => a.setTheme('system')}
              className={cn(
                'flex flex-col items-center justify-center gap-2 rounded-lg border p-4 text-center transition-colors hover:border-border-strong',
                a.theme === 'system' && 'border-2 border-fg',
              )}
            >
              <MonitorCog className="h-8 w-8 text-muted" />
              <span className="text-sm font-semibold">{t('appearance.followSystem')}</span>
              <span className="text-[11px] text-muted">
                {t('appearance.currently', {
                  theme: THEMES.find((x) => x.id === resolved)?.name ?? resolved,
                })}
              </span>
            </button>
            {THEMES.map((th) => (
              <ThemeCard
                key={th.id}
                theme={th}
                active={a.theme === th.id}
                onSelect={() => a.setTheme(th.id)}
              />
            ))}
          </div>
          {a.theme === 'system' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="sys-dark">{t('appearance.systemDark')}</Label>
                <Select
                  value={a.systemDark}
                  onValueChange={(v) => a.setSystemPair(v as ThemeId, a.systemLight)}
                >
                  <SelectTrigger id="sys-dark">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {darkThemes.map((th) => (
                      <SelectItem key={th.id} value={th.id}>
                        {th.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sys-light">{t('appearance.systemLight')}</Label>
                <Select
                  value={a.systemLight}
                  onValueChange={(v) => a.setSystemPair(a.systemDark, v as ThemeId)}
                >
                  <SelectTrigger id="sys-light">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {lightThemes.map((th) => (
                      <SelectItem key={th.id} value={th.id}>
                        {th.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title={t('appearance.display')}>
        <SettingRow label={t('appearance.accent')} description={t('appearance.accentHint')}>
          <ToggleGroup
            type="single"
            value={a.accent}
            onValueChange={(v) => v && a.setAccent(v as Accent)}
            aria-label={t('appearance.accent')}
          >
            <ToggleGroupItem value="soft">{t('appearance.accentSoft')}</ToggleGroupItem>
            <ToggleGroupItem value="default">{t('appearance.accentDefault')}</ToggleGroupItem>
            <ToggleGroupItem value="strong">{t('appearance.accentStrong')}</ToggleGroupItem>
          </ToggleGroup>
        </SettingRow>
        <SettingRow label={t('appearance.density')} description={t('appearance.densityHint')}>
          <ToggleGroup
            type="single"
            value={a.density}
            onValueChange={(v) => v && a.setDensity(v as Density)}
            aria-label={t('appearance.density')}
          >
            <ToggleGroupItem value="comfortable">{t('appearance.comfortable')}</ToggleGroupItem>
            <ToggleGroupItem value="compact">{t('appearance.compact')}</ToggleGroupItem>
          </ToggleGroup>
        </SettingRow>
        <SettingRow id="language" label={t('appearance.language')}>
          <Select value={a.language} onValueChange={(v) => a.setLanguage(v as Language)}>
            <SelectTrigger id="language" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="fr">Français</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
      </SettingsSection>
    </>
  );
}
