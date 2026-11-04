/**
 * Chart colours resolved from CSS custom properties. Re-read whenever the
 * theme or accent attribute on <html> changes (a MutationObserver avoids
 * depending on React effect ordering).
 *
 * One shared observer and one cached palette serve every chart and
 * sparkline, rather than one observer and a dozen style reads per instance
 * (the CPU page mounts one sparkline per core).
 */
import { useSyncExternalStore } from 'react';

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
  const style = getComputedStyle(document.documentElement);
  const v = (name: string) => style.getPropertyValue(name).trim();
  return {
    series: [v('--chart-1'), v('--chart-2'), v('--chart-3'), v('--chart-4'), v('--chart-5')],
    grid: v('--chart-grid'),
    text: v('--text-muted'),
    faint: v('--text-faint'),
    border: v('--border-strong'),
    surface: v('--surface'),
    danger: v('--danger'),
    warning: v('--warning'),
    stroke: parseFloat(v('--chart-stroke')) || 1.5,
  };
}

let current: Palette | null = null;
const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!observer) {
    observer = new MutationObserver(() => {
      current = read();
      listeners.forEach((l) => l());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-accent'],
    });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && observer) {
      observer.disconnect();
      observer = null;
      current = null; // re-read on next use: the theme may change meanwhile
    }
  };
}

function snapshot(): Palette {
  current ??= read();
  return current;
}

export function usePalette(): Palette {
  return useSyncExternalStore(subscribe, snapshot);
}

/** Append an alpha channel to a #rrggbb grey (keeps it a grey). */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return /^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${a}` : hex;
}
