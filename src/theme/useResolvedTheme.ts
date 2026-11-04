import { useEffect, useState } from 'react';
import { useAppearance } from '@/stores/appearance';
import { resolveTheme, type ThemeId } from './themes';

function usePrefersDark(): boolean {
  const query = '(prefers-color-scheme: dark)';
  const [dark, setDark] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return dark;
}

/** The concrete theme currently applied. */
export function useResolvedTheme(): ThemeId {
  const { theme, systemDark, systemLight } = useAppearance();
  const prefersDark = usePrefersDark();
  return resolveTheme(theme, prefersDark, systemDark, systemLight);
}
