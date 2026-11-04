/** Backend configuration (persisted by Rust in config.json). */
import { create } from 'zustand';
import { backend } from '@/lib/api';
import type { Config } from '@/lib/types';
import { toast } from './toast';

interface ConfigState {
  config: Config | null;
  saving: boolean;
  load: () => Promise<Config>;
  /** Apply a mutation to a copy of the config and persist it. */
  patch: (mutate: (draft: Config) => void) => Promise<boolean>;
  replace: (next: Config) => Promise<boolean>;
}

export const useConfig = create<ConfigState>((set, get) => ({
  config: null,
  saving: false,

  load: async () => {
    const config = await backend().getConfig();
    set({ config });
    return config;
  },

  replace: async (next) => {
    set({ saving: true });
    try {
      const stored = await backend().updateConfig(next);
      set({ config: stored });
      return true;
    } catch (e) {
      toast.error('Settings could not be saved', e);
      return false;
    } finally {
      set({ saving: false });
    }
  },

  patch: async (mutate) => {
    const current = get().config;
    if (!current) return false;
    const draft = structuredClone(current);
    mutate(draft);
    // Optimistic update keeps controls responsive; the stored value
    // (possibly clamped by the backend) replaces it on success.
    set({ config: draft });
    const ok = await get().replace(draft);
    if (!ok) set({ config: current });
    return ok;
  },
}));

/** Number of samples kept for a configuration (mirrors Config::history_capacity). */
export function historyCapacity(c: Config): number {
  return Math.max(
    60,
    Math.floor((c.monitoring.historyMinutes * 60_000) / Math.max(1, c.monitoring.refreshMs)),
  );
}
