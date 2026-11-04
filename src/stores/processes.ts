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

export const useProcesses = create<ProcessState>((set, get) => ({
  processes: [],
  updatedAt: null,
  subscribers: 0,

  start: async () => {
    const n = get().subscribers + 1;
    set({ subscribers: n });
    if (n > 1) return;
    const api = backend();
    unlisten = await api.onProcesses((processes) => set({ processes, updatedAt: Date.now() }));
    await api.setProcessStreaming(true);
    const initial = await api.getProcesses();
    if (!get().updatedAt && initial.length) set({ processes: initial, updatedAt: Date.now() });
  },

  stop: () => {
    const n = Math.max(0, get().subscribers - 1);
    set({ subscribers: n });
    if (n > 0) return;
    unlisten?.();
    unlisten = null;
    backend()
      .setProcessStreaming(false)
      .catch(() => {});
  },

  remove: (pid) => set((s) => ({ processes: s.processes.filter((p) => p.pid !== pid) })),
  patchStatus: (pid, status) =>
    set((s) => ({ processes: s.processes.map((p) => (p.pid === pid ? { ...p, status } : p)) })),
}));
