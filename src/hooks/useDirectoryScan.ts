import { useCallback, useRef, useState } from 'react';
import { useT } from '@/i18n';
import { backend } from '@/lib/api';
import type { ScanResult } from '@/lib/types';
import { toast } from '@/stores/toast';

/**
 * State for the "largest folders" scanner. Shared by the page so a drive
 * card's button can start a scan directly. If a new scan starts before the
 * previous one finishes, the stale result is ignored.
 */
export function useDirectoryScan(initialPath: string) {
  const t = useT();
  const [path, setPath] = useState(initialPath);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState<string | null>(null);
  const requestId = useRef(0);

  const scan = useCallback(
    async (target: string) => {
      const p = target.trim();
      if (!p) return;
      const id = ++requestId.current;
      setPath(p);
      setScanning(p);
      try {
        const r = await backend().scanDirectory(p);
        if (id === requestId.current) setResult(r);
      } catch (e) {
        if (id === requestId.current) toast.error(t('storage.scanFailed'), e);
      } finally {
        if (id === requestId.current) setScanning(null);
      }
    },
    [t],
  );

  return { path, setPath, result, scanning, scan };
}
