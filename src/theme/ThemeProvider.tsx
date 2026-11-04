/**
 * Applies appearance preferences to <html> as data attributes
 * (data-theme / data-accent / data-density / lang) and follows the OS
 * colour-scheme when the theme is "system".
 */
import { useEffect, type ReactNode } from 'react';
import { setFormatLocale } from '@/lib/format';
import { useAppearance } from '@/stores/appearance';
import { useResolvedTheme } from './useResolvedTheme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const resolved = useResolvedTheme();
  const accent = useAppearance((s) => s.accent);
  const density = useAppearance((s) => s.density);
  const language = useAppearance((s) => s.language);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', resolved);
    root.setAttribute('data-accent', accent);
    root.setAttribute('data-density', density);
    root.setAttribute('lang', language);
    setFormatLocale(language === 'fr' ? 'fr-FR' : 'en-US');
  }, [resolved, accent, density, language]);

  return <>{children}</>;
}
