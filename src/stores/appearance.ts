/**
 * Appearance preferences, persisted in localStorage ("pulse.appearance") so
 * the first paint already uses the right theme (see public/theme-init.js).
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ThemeChoice, ThemeId } from '@/theme/themes';

export type Accent = 'default' | 'soft' | 'strong';
export type Density = 'comfortable' | 'compact';
export type Language = 'en' | 'fr';

export interface AppearanceState {
  theme: ThemeChoice;
  systemDark: ThemeId;
  systemLight: ThemeId;
  accent: Accent;
  density: Density;
  language: Language;
  sidebarCollapsed: boolean;
  setTheme: (t: ThemeChoice) => void;
  setSystemPair: (dark: ThemeId, light: ThemeId) => void;
  setAccent: (a: Accent) => void;
  setDensity: (d: Density) => void;
  setLanguage: (l: Language) => void;
  toggleSidebar: () => void;
}

function initialLanguage(): Language {
  if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('fr')) return 'fr';
  return 'en';
}

export const useAppearance = create<AppearanceState>()(
  persist(
    (set) => ({
      theme: 'system',
      systemDark: 'obsidian',
      systemLight: 'paper',
      accent: 'default',
      density: 'comfortable',
      language: initialLanguage(),
      sidebarCollapsed: false,
      setTheme: (theme) => set({ theme }),
      setSystemPair: (systemDark, systemLight) => set({ systemDark, systemLight }),
      setAccent: (accent) => set({ accent }),
      setDensity: (density) => set({ density }),
      setLanguage: (language) => set({ language }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    {
      name: 'pulse.appearance',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);
