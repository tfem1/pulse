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
