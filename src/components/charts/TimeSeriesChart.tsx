/**
 * Real-time line chart backed by uPlot (canvas, ~45 KB, very low CPU).
 *
 * The chart is created once per palette/series configuration and then
 * updated imperatively with `setData` whenever the metrics store's
 * `version` changes — React never re-renders on a tick. Updates are skipped
 * while the page is hidden or the display is paused.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import uPlot from 'uplot';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useMetrics } from '@/stores/metrics';
import { usePalette, withAlpha } from '@/theme/usePalette';

export interface ChartSeries {
  key: string;
  label: string;
  /** Palette slot 1-5 (maps to --chart-N). */
  color?: 1 | 2 | 3 | 4 | 5;
  /** Dash pattern, e.g. [6, 4]. Distinguishes series without colour. */
  dash?: number[];
  /** Stroke width multiplier. */
  width?: number;
  fill?: boolean;
}

export interface TimeSeriesChartProps {
  series: ChartSeries[];
  seconds: number;
  height?: number;
  /** Fixed y maximum (e.g. 100 for percentages). */
  yMax?: number;
  /** Minimum y maximum when auto-scaling (avoids a flat line filling the chart). */
  yMinMax?: number;
  format?: (v: number) => string;
  transform?: (v: number) => number;
  legend?: boolean;
  className?: string;
  ariaLabel: string;
}

/** When the pointer is not over the plot, the legend shows the newest sample. */
function showLatest(plot: uPlot) {
  const n = plot.data[0]?.length ?? 0;
  const left = plot.cursor.left;
  if (n > 0 && (left == null || left < 0)) plot.setLegend({ idx: n - 1 }, false);
}

const DEFAULT_DASHES: (number[] | undefined)[] = [undefined, [6, 3], [2, 3], [10, 3, 2, 3], [1, 2]];

export function TimeSeriesChart({
  series,
  seconds,
  height = 220,
  yMax,
  yMinMax = 1,
  format = (v) => v.toFixed(1),
  transform,
  legend = true,
  className,
  ariaLabel,
}: TimeSeriesChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const palette = usePalette();
  // Latest-value refs so the long-lived uPlot callbacks never go stale.
  const fmtRef = useRef(format);
  const transformRef = useRef(transform);
  const secondsRef = useRef(seconds);
  useLayoutEffect(() => {
    fmtRef.current = format;
    transformRef.current = transform;
    secondsRef.current = seconds;
  });

  // Callers may pass a fresh array every render; key everything on its content.
  const seriesSig = JSON.stringify(series);
  const keys = useMemo(() => (JSON.parse(seriesSig) as ChartSeries[]).map((s) => s.key), [seriesSig]);

  // (Re)create the plot when its configuration changes.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const width = Math.max(200, el.clientWidth);
    const opts: uPlot.Options = {
      width,
      height,
      legend: { show: legend, live: true },
      cursor: { drag: { x: false, y: false }, points: { size: 6, fill: palette.surface } },
      scales: {
        x: {
          time: true,
          range: (_u, _min, max) => {
            const hi = Number.isFinite(max) ? max : Date.now() / 1000;
            return [hi - secondsRef.current, hi];
          },
        },
        y: {
          range: (_u, _min, max) => {
            if (yMax != null) return [0, yMax];
            const hi = Number.isFinite(max) ? max : 0;
            return [0, Math.max(yMinMax, hi * 1.15)];
          },
        },
      },
      axes: [
        {
          stroke: palette.text,
          grid: { stroke: palette.grid, width: 1 },
          ticks: { stroke: palette.grid, width: 1 },
          values: (_u, vals) => vals.map((v) => formatTime(v * 1000)),
          space: 80,
        },
        {
          stroke: palette.text,
          grid: { stroke: palette.grid, width: 1 },
          ticks: { show: false },
          size: 64,
          values: (_u, vals) => vals.map((v) => fmtRef.current(v)),
        },
      ],
      series: [
        { value: (_u, v) => (v == null ? '—' : formatTime(v * 1000)) },
        ...series.map((s, i) => {
          const color = palette.series[(s.color ?? (i % 5) + 1) - 1];
          return {
            label: s.label,
            stroke: color,
            width: palette.stroke * (s.width ?? (i === 0 ? 1.3 : 1)),
            dash: s.dash ?? DEFAULT_DASHES[i % DEFAULT_DASHES.length],
            fill: s.fill ? withAlpha(color, 0.12) : undefined,
            points: { show: false },
            spanGaps: false,
            value: (_u: uPlot, v: number | null) => (v == null ? '—' : fmtRef.current(v)),
          } satisfies uPlot.Series;
        }),
      ],
    };
    const st = useMetrics.getState();
    const plot = new uPlot(opts, st.bank.window(keys, secondsRef.current, transformRef.current), el);
    plotRef.current = plot;
    showLatest(plot);

    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0].contentRect.width);
      if (w > 0 && Math.abs(w - plot.width) > 1) plot.setSize({ width: w, height });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      plot.destroy();
      plotRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seriesSig captures `series`
  }, [palette, seriesSig, height, yMax, yMinMax, legend, keys]);

  // Push new data on every tick (and when the window changes).
  useEffect(() => {
    const redraw = () => {
      const plot = plotRef.current;
      if (!plot || document.hidden) return;
      const st = useMetrics.getState();
      plot.setData(st.bank.window(keys, secondsRef.current, transformRef.current));
      showLatest(plot);
    };
    redraw();
    const unsub = useMetrics.subscribe((s, prev) => {
      if (s.version !== prev.version && !s.paused) redraw();
    });
    document.addEventListener('visibilitychange', redraw);
    return () => {
      unsub();
      document.removeEventListener('visibilitychange', redraw);
    };
  }, [keys, seconds]);

  return <div ref={wrapRef} role="img" aria-label={ariaLabel} className={cn('w-full min-w-0', className)} />;
}
