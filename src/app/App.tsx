import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router';
import { Toaster } from '@/components/Toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
import { getBackend } from '@/lib/api';
import { errorMessage } from '@/lib/types';
import { useAlerts } from '@/stores/alerts';
import { historyCapacity, useConfig } from '@/stores/config';
import { useMetrics } from '@/stores/metrics';
import { toast } from '@/stores/toast';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { router } from './router';

function Splash({ error }: { error: string | null }) {
  const t = useT();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <img src="/pulse.svg" alt="" className="h-12 w-12 animate-pulse" />
      {error ? (
        <div role="alert" className="max-w-md rounded-lg border-2 border-danger p-4 text-center text-sm">
          <p className="font-semibold">{t('app.startFailed')}</p>
          <p className="selectable mt-1 text-muted">{error}</p>
        </div>
      ) : (
        <p className="text-sm text-muted">{t('app.starting')}</p>
      )}
    </div>
  );
}

export function App() {
  const ready = useMetrics((s) => s.ready);
  const [error, setError] = useState<string | null>(null);
  const config = useConfig((s) => s.config);
  const resize = useMetrics((s) => s.resize);

  useEffect(() => {
    let off: (() => void) | undefined;
    let disposed = false;
    (async () => {
      const api = await getBackend();
      const cfg = await useConfig.getState().load();
      await useMetrics.getState().init(historyCapacity(cfg));
      await useAlerts.getState().load();
      off = await api.onAlert((e) => {
        useAlerts.getState().push(e);
        if (e.kind === 'fired') toast.warning(e.ruleName);
      });
      if (disposed) off();
    })().catch((e) => setError(errorMessage(e)));
    return () => {
      disposed = true;
      off?.();
    };
  }, []);

  // Keep the chart buffers sized to the configured history window.
  useEffect(() => {
    if (config) resize(historyCapacity(config));
  }, [config, resize]);

  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={400}>
        {ready ? <RouterProvider router={router} /> : <Splash error={error} />}
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}
