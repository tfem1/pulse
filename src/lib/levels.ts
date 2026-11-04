/** Status level from a value and thresholds (higher is worse). */
export type Level = 'ok' | 'warning' | 'danger' | 'unknown';

export function levelFor(value: number | null | undefined, warn = 75, danger = 90): Level {
  if (value == null || !Number.isFinite(value)) return 'unknown';
  if (value >= danger) return 'danger';
  if (value >= warn) return 'warning';
  return 'ok';
}
