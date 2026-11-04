import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { useT } from '@/i18n';
import { DangerGlyph } from './DangerGlyph';
import { cn } from '@/lib/utils';
import { useToasts } from '@/stores/toast';

const ICONS = { info: Info, success: CircleCheck, warning: TriangleAlert };

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  const t = useT();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {toasts.map((toast) => {
        const Icon = toast.kind === 'error' ? null : ICONS[toast.kind];
        return (
          <div
            key={toast.id}
            role={toast.kind === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex animate-fade-in items-start gap-3 rounded-lg border bg-bg-elevated p-3 shadow-card',
              toast.kind === 'error' ? 'border-2 border-danger' : 'border-border-strong',
            )}
          >
            {Icon ? (
              <Icon
                className={cn(
                  'mt-0.5 h-5 w-5 shrink-0',
                  toast.kind === 'warning' && 'text-warning',
                  toast.kind === 'success' && 'text-success',
                  toast.kind === 'info' && 'text-muted',
                )}
                strokeWidth={2.5}
              />
            ) : (
              <DangerGlyph className="mt-0.5 h-5 w-5" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{toast.title}</p>
              {toast.description && (
                <p className="selectable mt-0.5 text-sm text-muted">{toast.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="rounded text-faint hover:text-fg"
              aria-label={t('common.dismiss')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
