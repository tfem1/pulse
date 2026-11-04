/** Theme catalogue. Token values live in src/styles/themes.css. */
import type { TKey } from '@/i18n';

export const THEME_IDS = [
  'obsidian',
  'graphite',
  'slate',
  'paper',
  'fog',
  'carbon',
  'high-contrast',
] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export type ThemeChoice = ThemeId | 'system';

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  dark: boolean;
  /** i18n key of the one-line description. */
  descriptionKey: TKey;
  /** Representative swatches for the preview card (bg, surface, border, text, muted, chart-1, chart-3). */
  preview: {
    bg: string;
    surface: string;
    border: string;
    text: string;
    muted: string;
    chartA: string;
    chartB: string;
  };
}

export const THEMES: readonly ThemeMeta[] = [
  {
    id: 'obsidian',
    name: 'Obsidian',
    dark: true,
    descriptionKey: 'theme.obsidian.desc',
    preview: {
      bg: '#0f0f0f',
      surface: '#1c1c1c',
      border: '#2e2e2e',
      text: '#ededed',
      muted: '#a3a3a3',
      chartA: '#f2f2f2',
      chartB: '#7d7d7d',
    },
  },
  {
    id: 'graphite',
    name: 'Graphite',
    dark: true,
    descriptionKey: 'theme.graphite.desc',
    preview: {
      bg: '#1e1e1e',
      surface: '#2a2a2a',
      border: '#3a3a3a',
      text: '#e0e0e0',
      muted: '#a6a6a6',
      chartA: '#ececec',
      chartB: '#8c8c8c',
    },
  },
  {
    id: 'slate',
    name: 'Slate',
    dark: true,
    descriptionKey: 'theme.slate.desc',
    preview: {
      bg: '#202020',
      surface: '#313131',
      border: '#454545',
      text: '#f2f2f2',
      muted: '#b3b3b3',
      chartA: '#f5f5f5',
      chartB: '#929292',
    },
  },
  {
    id: 'paper',
    name: 'Paper',
    dark: false,
    descriptionKey: 'theme.paper.desc',
    preview: {
      bg: '#f6f6f6',
      surface: '#ffffff',
      border: '#dddddd',
      text: '#141414',
      muted: '#525252',
      chartA: '#111111',
      chartB: '#777777',
    },
  },
  {
    id: 'fog',
    name: 'Fog',
    dark: false,
    descriptionKey: 'theme.fog.desc',
    preview: {
      bg: '#e4e4e4',
      surface: '#eaeaea',
      border: '#d0d0d0',
      text: '#3d3d3d',
      muted: '#5e5e5e',
      chartA: '#2a2a2a',
      chartB: '#737373',
    },
  },
  {
    id: 'carbon',
    name: 'Carbon',
    dark: true,
    descriptionKey: 'theme.carbon.desc',
    preview: {
      bg: '#000000',
      surface: '#0d0d0d',
      border: '#262626',
      text: '#ffffff',
      muted: '#b8b8b8',
      chartA: '#ffffff',
      chartB: '#7f7f7f',
    },
  },
  {
    id: 'high-contrast',
    name: 'High Contrast',
    dark: true,
    descriptionKey: 'theme.highContrast.desc',
    preview: {
      bg: '#000000',
      surface: '#000000',
      border: '#ffffff',
      text: '#ffffff',
      muted: '#e6e6e6',
      chartA: '#ffffff',
      chartB: '#8c8c8c',
    },
  },
];

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === 'string' && (THEME_IDS as readonly string[]).includes(v);
}

/** Resolve "system" to a concrete theme. */
export function resolveTheme(
  choice: ThemeChoice,
  prefersDark: boolean,
  systemDark: ThemeId,
  systemLight: ThemeId,
): ThemeId {
  if (choice === 'system') return prefersDark ? systemDark : systemLight;
  return choice;
}
