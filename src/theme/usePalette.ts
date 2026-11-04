/**
 * Chart colours resolved from CSS custom properties. Re-reads whenever the
 * theme or accent attribute on <html> changes (a MutationObserver avoids
 * depending on React effect ordering).
 */
import { useEffect, useState } from 'react';
import { cssVar } from './themes';

export interface Palette {
  series: [string, string, string, string, string];
  grid: string;
  text: string;
  faint: string;
  border: string;
  surface: string;
  danger: string;
  warning: string;
  stroke: number;
}

function read(): Palette {
  return {
    series: [
      cssVar('--chart-1'),
      cssVar('--chart-2'),
      cssVar('--chart-3'),
      cssVar('--chart-4'),
      cssVar('--chart-5'),
    ],
    grid: cssVar('--chart-grid'),
    text: cssVar('--text-muted'),
    faint: cssVar('--text-faint'),
    border: cssVar('--border-strong'),
    surface: cssVar('--surface'),
    danger: cssVar('--danger'),
    warning: cssVar('--warning'),
    stroke: parseFloat(cssVar('--chart-stroke')) || 1.5,
  };
}

export function usePalette(): Palette {
  const [palette, setPalette] = useState<Palette>(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setPalette(read()));
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-accent'],
    });
    return () => obs.disconnect();
  }, []);
  return palette;
}

/** Append an alpha channel to a #rrggbb grey (keeps it a grey). */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return /^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${a}` : hex;
}
