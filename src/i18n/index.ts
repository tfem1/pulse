/**
 * Minimal, dependency-free i18n. `en` is the source of truth; `fr` is typed
 * against it, so a missing translation is a compile error.
 */
import { useCallback } from 'react';
import { useAppearance, type Language } from '@/stores/appearance';
import { en, type TKey } from './en';
import { fr } from './fr';

export type { TKey };

const DICTS: Record<Language, Record<TKey, string>> = { en, fr };

export type TVars = Record<string, string | number>;

export function translate(lang: Language, key: TKey, vars?: TVars): string {
  let s = DICTS[lang]?.[key] ?? en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

export type TFn = (key: TKey, vars?: TVars) => string;

export function useT(): TFn {
  const lang = useAppearance((s) => s.language);
  return useCallback((key: TKey, vars?: TVars) => translate(lang, key, vars), [lang]);
}

/** Translate outside React (uses the persisted language). */
export function t(key: TKey, vars?: TVars): string {
  return translate(useAppearance.getState().language, key, vars);
}
