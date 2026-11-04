import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

/**
 * Every colour maps to a CSS custom property defined in src/styles/themes.css,
 * so switching `data-theme` re-skins the whole app without re-rendering.
 * There is intentionally no hue anywhere in this palette.
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        'bg-elevated': 'var(--bg-elevated)',
        surface: 'var(--surface)',
        'surface-hover': 'var(--surface-hover)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        fg: 'var(--text)',
        muted: 'var(--text-muted)',
        faint: 'var(--text-faint)',
        accent: 'var(--accent)',
        'on-accent': 'var(--on-accent)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
        focus: 'var(--focus)',
        'chart-1': 'var(--chart-1)',
        'chart-2': 'var(--chart-2)',
        'chart-3': 'var(--chart-3)',
        'chart-4': 'var(--chart-4)',
        'chart-5': 'var(--chart-5)',
      },
      borderWidth: {
        DEFAULT: 'var(--border-width)',
      },
      ringWidth: {
        DEFAULT: 'var(--ring-width)',
      },
      ringColor: {
        DEFAULT: 'var(--focus)',
      },
      ringOffsetWidth: {
        DEFAULT: 'var(--ring-offset)',
      },
      boxShadow: {
        card: 'var(--shadow)',
      },
      height: {
        row: 'var(--row-h)',
      },
      spacing: {
        card: 'var(--card-pad)',
        page: 'var(--page-pad)',
        gap: 'var(--gap)',
      },
      gap: {
        DEFAULT: 'var(--gap)',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Cascadia Mono"', 'Consolas', '"DejaVu Sans Mono"', 'monospace'],
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
      },
    },
  },
  plugins: [animate],
};

export default config;
