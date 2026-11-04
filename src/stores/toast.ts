import { create } from 'zustand';
import { errorMessage, isBackendError } from '@/lib/types';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>, timeoutMs?: number) => void;
  dismiss: (id: number) => void;
}

let next = 1;

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t, timeoutMs = 5000) => {
    const id = next++;
    set((s) => ({ toasts: [...s.toasts.slice(-4), { ...t, id }] }));
    if (timeoutMs > 0) setTimeout(() => get().dismiss(id), timeoutMs);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

/** Convenience helpers usable outside React. */
export const toast = {
  info: (title: string, description?: string) =>
    useToasts.getState().push({ kind: 'info', title, description }),
  success: (title: string, description?: string) =>
    useToasts.getState().push({ kind: 'success', title, description }),
  warning: (title: string, description?: string) =>
    useToasts.getState().push({ kind: 'warning', title, description }, 8000),
  /** Show a backend error; permission errors stay longer so they can be read. */
  error: (title: string, err?: unknown) =>
    useToasts
      .getState()
      .push(
        { kind: 'error', title, description: err === undefined ? undefined : errorMessage(err) },
        isBackendError(err) && err.kind === 'permissionDenied' ? 12000 : 8000,
      ),
};
