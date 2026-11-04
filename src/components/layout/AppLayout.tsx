import { Outlet, useLocation } from 'react-router';
import { DangerGlyph } from '@/components/DangerGlyph';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useGlobalHotkeys } from '@/hooks/useHotkeys';
import { useT } from '@/i18n';
import { useMetrics } from '@/stores/metrics';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function AppLayout() {
  const t = useT();
  const location = useLocation();
  const fatal = useMetrics((s) => s.fatal);
  const paused = useMetrics((s) => s.paused);
  useGlobalHotkeys();

  return (
    <div className="flex h-full">
      <a href="#main" className="skip-link">
        {t('app.skipToContent')}
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        {fatal && (
          <div
            role="alert"
            className="flex items-center gap-2 border-b-2 border-danger bg-surface px-page py-2 text-sm"
          >
            <DangerGlyph />
            {t('app.samplerFailed')}: {fatal}
          </div>
        )}
        {paused && (
          <div className="border-b border-dashed border-border-strong bg-surface px-page py-1.5 text-xs font-medium text-muted">
            {t('app.pausedBanner')}
          </div>
        )}
        <main id="main" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto p-page focus:outline-none">
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
