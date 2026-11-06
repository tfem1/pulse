/**
 * In-app updater state. Lives in a store (not the Settings component) so an
 * update keeps running, and its progress stays visible, when the user
 * switches pages, and so the optional start-up check can share its result.
 */
import { create } from 'zustand';
import { backend } from '@/lib/api';
import { errorMessage, isBackendError, type UpdateInfo, type UpdateProgress } from '@/lib/types';

export type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ready'; info: UpdateInfo }
  | { kind: 'noReleases' }
  | { kind: 'error'; message: string }
  | { kind: 'installing'; info: UpdateInfo; progress: UpdateProgress | null }
  | { kind: 'installFailed'; info: UpdateInfo; message: string };

interface UpdateState {
  status: UpdateStatus;
  /** Ask GitHub for the latest release. Returns the result (null on error). */
  check: () => Promise<UpdateInfo | null>;
  /** Download, verify and install the release found by `check`. */
  install: () => Promise<void>;
}

export const useUpdate = create<UpdateState>((set, get) => ({
  status: { kind: 'idle' },

  async check() {
    const s = get().status;
    if (s.kind === 'checking' || s.kind === 'installing') return null;
    set({ status: { kind: 'checking' } });
    try {
      const info = await backend().checkUpdate();
      set({ status: { kind: 'ready', info } });
      return info;
    } catch (e) {
      set({
        status:
          isBackendError(e) && e.kind === 'notFound'
            ? { kind: 'noReleases' }
            : { kind: 'error', message: errorMessage(e) },
      });
      return null;
    }
  },

  async install() {
    const s = get().status;
    if ((s.kind !== 'ready' && s.kind !== 'installFailed') || !s.info.available || !s.info.asset) return;
    const info = s.info;
    set({ status: { kind: 'installing', info, progress: null } });
    const off = await backend().onUpdateProgress((progress) => {
      const cur = get().status;
      if (cur.kind === 'installing') set({ status: { ...cur, progress } });
    });
    try {
      // On success Pulse quits and the new version starts; the UI stays on
      // "Restarting…" until then.
      await backend().installUpdate();
      // The "restart" event may arrive after the command resolves.
      set({ status: { kind: 'installing', info, progress: { phase: 'restart', downloaded: 0, total: 0 } } });
    } catch (e) {
      set({ status: { kind: 'installFailed', info, message: errorMessage(e) } });
    } finally {
      off();
    }
  },
}));
