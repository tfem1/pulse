/**
 * Process list. Streaming is reference-counted: the backend only refreshes
 * the full process table while at least one view needs it.
 */
import { create } from 'zustand';
import { backend } from '@/lib/api';
import type { ProcessInfo } from '@/lib/types';

interface ProcessState {
  processes: ProcessInfo[];
  updatedAt: number | null;
  subscribers: number;
  start: () => Promise<void>;
  stop: () => void;
  remove: (pid: number) => void;
  patchStatus: (pid: number, status: string) => void;
}

let unlisten: (() => void) | null = null;
let generation = 0;

export const useProcesses = create<ProcessState>((set, get) => ({
  processes: [],
  updatedAt: null,
  subscribers: 0,

  start: async () => {
    const n = get().subscribers + 1;
    set({ subscribers: n });
    if (n > 1) return;
    const gen = ++generation;
    // A stop() (or a newer start()) while we await makes this call stale:
    // undo what it set up instead of leaving a listener or backend
    // streaming running with nobody watching.
    const stale = () => gen !== generation;
    const api = backend();
    const off = await api.onProcesses((processes) => set({ processes, updatedAt: Date.now() }));
    if (stale()) {
      off();
      return;
    }
    unlisten = off;
    await api.setProcessStreaming(true);
    if (stale()) return;
    const initial = await api.getProcesses();
    if (!stale() && !get().updatedAt && initial.length) set({ processes: initial, updatedAt: Date.now() });
  },

  stop: () => {
    const n = Math.max(0, get().subscribers - 1);
    set({ subscribers: n });
    if (n > 0) return;
    generation++;
    unlisten?.();
    unlisten = null;
    // Drop the (potentially large) list; it is re-fetched on the next visit.
    set({ processes: [], updatedAt: null });
    backend()
      .setProcessStreaming(false)
      .catch(() => {});
  },

  remove: (pid) => set((s) => ({ processes: s.processes.filter((p) => p.pid !== pid) })),
  patchStatus: (pid, status) =>
    set((s) => ({ processes: s.processes.map((p) => (p.pid === pid ? { ...p, status } : p)) })),
}));
