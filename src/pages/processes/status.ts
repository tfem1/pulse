import type { CSSProperties } from 'react';
import type { TFn, TKey } from '@/i18n';

const STATUS_KEYS: Record<string, TKey> = {
  running: 'pstatus.running',
  sleeping: 'pstatus.sleeping',
  idle: 'pstatus.idle',
  stopped: 'pstatus.stopped',
  suspended: 'pstatus.suspended',
  zombie: 'pstatus.zombie',
  dead: 'pstatus.dead',
  tracing: 'pstatus.tracing',
  uninterruptibleDiskSleep: 'pstatus.diskSleep',
};

export function statusLabel(t: TFn, status: string): string {
  const key = STATUS_KEYS[status];
  return key ? t(key) : status;
}

/** Greyscale "heat" behind numeric cells, like Task Manager but hue-free. */
export function heat(fraction: number): CSSProperties | undefined {
  const f = Math.min(1, Math.max(0, fraction));
  if (f < 0.02) return undefined;
  return { backgroundColor: `color-mix(in srgb, var(--text) ${Math.round(4 + f * 30)}%, transparent)` };
}
