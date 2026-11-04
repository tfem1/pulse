/** Tiny canvas sparkline fed from the metrics series bank. */
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useMetrics } from '@/stores/metrics';
import { usePalette, withAlpha } from '@/theme/usePalette';

export function Sparkline({
  seriesKey,
  points = 60,
  max,
  height = 36,
  className,
}: {
  seriesKey: string;
  points?: number;
  /** Fixed maximum (e.g. 100); otherwise scales to the visible maximum. */
  max?: number;
  height?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const palette = usePalette();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      if (document.hidden) return;
      const data = useMetrics.getState().bank.tail(seriesKey, points);
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
      if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const valid = data.filter((v) => Number.isFinite(v));
      if (valid.length < 2) return;
      const top = max ?? Math.max(1e-9, ...valid) * 1.1;
      const step = w / Math.max(1, points - 1);
      const offset = points - data.length;
      ctx.beginPath();
      let started = false;
      data.forEach((v, i) => {
        if (!Number.isFinite(v)) return;
        const x = (offset + i) * step;
        const y = h - 1 - (Math.min(v, top) / top) * (h - 2);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = palette.series[0];
      ctx.lineWidth = palette.stroke;
      ctx.stroke();
      ctx.lineTo(w, h);
      ctx.lineTo(offset * step, h);
      ctx.closePath();
      ctx.fillStyle = withAlpha(palette.series[0], 0.1);
      ctx.fill();
    };
    draw();
    const unsub = useMetrics.subscribe((s, p) => {
      if (s.version !== p.version && !s.paused) draw();
    });
    return unsub;
  }, [seriesKey, points, max, palette]);

  return <canvas ref={ref} aria-hidden className={cn('block w-full', className)} style={{ height }} />;
}
