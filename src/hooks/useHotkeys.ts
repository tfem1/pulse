import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { NAV } from '@/app/nav';
import { useAppearance } from '@/stores/appearance';
import { useMetrics } from '@/stores/metrics';

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

/**
 * Global shortcuts:
 *   Ctrl/⌘ + 1…8   go to page
 *   Ctrl/⌘ + B     collapse / expand sidebar
 *   Ctrl/⌘ + ⇧ + P pause / resume live updates
 */
export function useGlobalHotkeys(): void {
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.altKey) return;
      if (!e.shiftKey && /^[1-8]$/.test(e.key)) {
        e.preventDefault();
        navigate(NAV[Number(e.key) - 1].path);
      } else if (!e.shiftKey && e.key.toLowerCase() === 'b' && !isTyping(e.target)) {
        e.preventDefault();
        useAppearance.getState().toggleSidebar();
      } else if (e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        const m = useMetrics.getState();
        m.setPaused(!m.paused);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);
}
