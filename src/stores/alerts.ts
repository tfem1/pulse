import { create } from 'zustand';
import { backend } from '@/lib/api';
import type { AlertEvent, RuleStatus } from '@/lib/types';

interface AlertState {
  events: AlertEvent[];
  statuses: Record<string, RuleStatus>;
  unread: number;
  load: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  push: (e: AlertEvent) => void;
  clear: () => Promise<void>;
  markRead: () => void;
}

export const useAlerts = create<AlertState>((set) => ({
  events: [],
  statuses: {},
  unread: 0,

  load: async () => {
    const events = await backend().getAlertEvents();
    set({ events });
  },

  refreshStatus: async () => {
    const list = await backend().getAlertStatus();
    set({ statuses: Object.fromEntries(list.map((s) => [s.ruleId, s])) });
  },

  push: (e) =>
    set((s) => ({
      events: [...s.events.slice(-199), e],
      unread: e.kind === 'fired' ? s.unread + 1 : s.unread,
    })),

  clear: async () => {
    await backend().clearAlertEvents();
    set({ events: [], unread: 0 });
  },

  markRead: () => set({ unread: 0 }),
}));
