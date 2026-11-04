import { cn } from '@/lib/utils';

/**
 * Filled octagon with a knocked-out "!" — the "danger" shape. Drawn by hand
 * so the mark is painted *after* the fill (lucide's OctagonAlert paints its
 * outline last, which hides the "!" when filled).
 */
export function DangerGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn('h-4 w-4 shrink-0 text-danger', className)}>
      <path d="M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86z" fill="currentColor" />
      <path d="M12 7v6" stroke="var(--bg)" strokeWidth="2.75" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1.6" fill="var(--bg)" />
    </svg>
  );
}
