/**
 * Guards the "monochrome only" requirement and WCAG contrast for every theme
 * by parsing the real stylesheet.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { THEME_IDS, THEMES } from './themes';

const css = readFileSync(fileURLToPath(new URL('../styles/themes.css', import.meta.url)), 'utf8');
const appCss = readFileSync(fileURLToPath(new URL('../styles/index.css', import.meta.url)), 'utf8');

const REQUIRED = [
  '--bg',
  '--bg-elevated',
  '--surface',
  '--surface-hover',
  '--border',
  '--border-strong',
  '--text',
  '--text-muted',
  '--text-faint',
  '--accent',
  '--on-accent',
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
  '--chart-grid',
  '--success',
  '--warning',
  '--danger',
  '--focus',
];

function themeBlock(id: string): Record<string, string> {
  const re = new RegExp(`\\[data-theme='${id}'\\]\\s*\\{([^}]*)\\}`);
  const m = css.match(re);
  if (!m) throw new Error(`no block for theme ${id}`);
  const tokens: Record<string, string> = {};
  for (const decl of m[1].split(';')) {
    const [k, ...v] = decl.split(':');
    if (k && v.length) tokens[k.trim()] = v.join(':').trim();
  }
  return tokens;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('monochrome palette', () => {
  it('uses only greys in every colour literal', () => {
    for (const source of [css, appCss]) {
      for (const hex of source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) {
        const [r, g, b] = hexToRgb(hex.slice(0, 7));
        expect(r === g && g === b, `${hex} is not grey`).toBe(true);
      }
      for (const m of source.matchAll(/rgba?\(([^)]*)\)/g)) {
        const [r, g, b] = m[1]
          .split(/[\s,/]+/)
          .filter(Boolean)
          .slice(0, 3)
          .map(Number);
        expect(r === g && g === b, `${m[0]} is not grey`).toBe(true);
      }
      expect(source).not.toMatch(/\bhsla?\(/);
    }
  });

  it('defines the theme catalogue consistently', () => {
    expect(THEMES.map((t) => t.id)).toEqual([...THEME_IDS]);
    for (const t of THEMES) {
      const tokens = themeBlock(t.id);
      expect(t.preview.bg).toBe(tokens['--bg']);
      expect(t.preview.text).toBe(tokens['--text']);
    }
  });
});

describe.each(THEME_IDS)('theme %s', (id) => {
  const t = themeBlock(id);
  const hc = id === 'high-contrast';

  it('defines the full token set', () => {
    for (const k of REQUIRED) expect(t[k], `${id} is missing ${k}`).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('meets text contrast targets', () => {
    for (const bg of ['--bg', '--surface', '--bg-elevated']) {
      expect(contrast(t['--text'], t[bg])).toBeGreaterThanOrEqual(hc ? 15 : 7);
      expect(contrast(t['--text-muted'], t[bg])).toBeGreaterThanOrEqual(hc ? 7 : 4.5);
      expect(contrast(t['--text-faint'], t[bg])).toBeGreaterThanOrEqual(hc ? 7 : 3);
    }
    expect(contrast(t['--on-accent'], t['--accent'])).toBeGreaterThanOrEqual(hc ? 7 : 4.5);
  });

  it('keeps charts and status readable against surfaces', () => {
    for (let i = 1; i <= 5; i++) {
      expect(contrast(t[`--chart-${i}`], t['--surface']), `chart-${i}`).toBeGreaterThanOrEqual(3);
    }
    // Neighbouring chart greys must be distinguishable.
    for (let i = 1; i < 5; i++) {
      expect(contrast(t[`--chart-${i}`], t[`--chart-${i + 1}`])).toBeGreaterThanOrEqual(1.15);
    }
    for (const s of ['--success', '--warning', '--danger']) {
      expect(contrast(t[s], t['--surface']), s).toBeGreaterThanOrEqual(3);
    }
    // Danger is always the most prominent status.
    expect(contrast(t['--danger'], t['--surface'])).toBeGreaterThan(contrast(t['--success'], t['--surface']));
  });

  it('uses heavier borders and focus rings for high contrast', () => {
    if (hc) {
      expect(t['--border-width']).toBe('2px');
      expect(parseInt(t['--ring-width'], 10)).toBeGreaterThanOrEqual(3);
    } else {
      expect(t['--border-width']).toBe('1px');
    }
  });
});
