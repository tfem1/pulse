/**
 * Live metrics store.
 *
 * `snapshot` drives the numeric widgets (React re-render once per tick).
 * The chart series live in a mutable `SeriesBank`; charts subscribe to
 * `version` and redraw imperatively through uPlot, so a tick never re-renders
 * chart components.
 */
import { create } from 'zustand';
import { backend } from '@/lib/api';
import { SeriesBank, type SeriesValues } from '@/lib/series';
import type { HistoryPoint, Snapshot, SystemInfo } from '@/lib/types';

/** Series key helpers shared by pages and charts. */
export const K = {
  cpu: 'cpu',
  core: (i: number) => `core${i}`,
  mem: 'mem',
  memPct: 'memPct',
  swap: 'swap',
  diskR: 'diskR',
  diskW: 'diskW',
  netRx: 'netRx',
  netTx: 'netTx',
  gpu: (i: number) => `gpu${i}`,
  gpuMem: (i: number) => `gpu${i}Mem`,
  gpuTemp: (i: number) => `gpu${i}Temp`,
  ifRx: (name: string) => `if:${name}:rx`,
  ifTx: (name: string) => `if:${name}:tx`,
  diskRead: (mount: string) => `disk:${mount}:r`,
  diskWrite: (mount: string) => `disk:${mount}:w`,
  sensor: (id: string) => `sensor:${id}`,
};

interface MetricsState {
  ready: boolean;
  isDemo: boolean;
  fatal: string | null;
  systemInfo: SystemInfo | null;
  snapshot: Snapshot | null;
  bank: SeriesBank;
  /** Incremented after every push; charts subscribe to it. */
  version: number;
  paused: boolean;
  init: (historyCapacity: number) => Promise<void>;
  setPaused: (p: boolean) => void;
  resize: (capacity: number) => void;
  clear: () => void;
}

function valuesFromSnapshot(s: Snapshot): SeriesValues {
  const v: SeriesValues = {
    [K.cpu]: s.cpu.total,
    [K.mem]: s.memory.used,
    [K.memPct]: s.memory.total ? (s.memory.used / s.memory.total) * 100 : null,
    [K.swap]: s.memory.swapUsed,
    [K.diskR]: s.disks ? s.diskReadBps : null,
    [K.diskW]: s.disks ? s.diskWriteBps : null,
    [K.netRx]: s.networks ? s.netRxBps : null,
    [K.netTx]: s.networks ? s.netTxBps : null,
  };
  s.cpu.perCore.forEach((c, i) => (v[K.core(i)] = c));
  s.gpus?.forEach((g) => {
    v[K.gpu(g.index)] = g.usage;
    v[K.gpuMem(g.index)] = g.memoryUsed;
    v[K.gpuTemp(g.index)] = g.temperatureC;
  });
  s.networks?.forEach((n) => {
    v[K.ifRx(n.name)] = n.rxBps;
    v[K.ifTx(n.name)] = n.txBps;
  });
  s.disks?.forEach((d) => {
    v[K.diskRead(d.mountPoint)] = d.readBps;
    v[K.diskWrite(d.mountPoint)] = d.writeBps;
  });
  s.sensors?.readings.forEach((r) => (v[K.sensor(r.id)] = r.value));
  return v;
}

function valuesFromHistory(p: HistoryPoint): SeriesValues {
  const v: SeriesValues = {
    [K.cpu]: p.cpu,
    [K.mem]: p.memUsed,
    [K.memPct]: p.memTotal ? (p.memUsed / p.memTotal) * 100 : null,
    [K.swap]: p.swapUsed,
    [K.diskR]: p.diskReadBps,
    [K.diskW]: p.diskWriteBps,
    [K.netRx]: p.netRxBps,
    [K.netTx]: p.netTxBps,
    [K.gpu(0)]: p.gpuUsage,
    [K.gpuMem(0)]: p.gpuMemUsed,
    [K.gpuTemp(0)]: p.gpuTempC,
  };
  p.perCore.forEach((c, i) => (v[K.core(i)] = c));
  return v;
}

let unlisten: (() => void) | null = null;

export const useMetrics = create<MetricsState>((set, get) => ({
  ready: false,
  isDemo: false,
  fatal: null,
  systemInfo: null,
  snapshot: null,
  bank: new SeriesBank(900),
  version: 0,
  paused: false,

  init: async (historyCapacity) => {
    const api = backend();
    const bank = new SeriesBank(historyCapacity);
    set({ isDemo: api.isDemo, bank });

    // Seed the charts with the backend's history first (the backend keeps
    // sampling while the window is hidden), then subscribe to live ticks.
    const [info, history, snapshot] = await Promise.all([
      api.getSystemInfo(),
      api.getHistory(),
      api.getSnapshot(),
    ]);
    for (const p of history) bank.push(p.timestampMs, valuesFromHistory(p));
    set((s) => ({
      ready: true,
      systemInfo: info ?? s.systemInfo,
      snapshot: s.snapshot ?? snapshot,
      version: s.version + 1,
    }));

    unlisten?.();
    const offSnap = await api.onSnapshot((s) => {
      const st = get();
      const last = st.bank.lastTime();
      if (!Number.isFinite(last) || s.timestampMs > last) st.bank.push(s.timestampMs, valuesFromSnapshot(s));
      if (!st.paused) set({ snapshot: s, version: st.version + 1 });
      if (!st.systemInfo) {
        api.getSystemInfo().then((i) => i && set({ systemInfo: i }));
      }
    });
    const offFatal = await api.onFatal((message) => set({ fatal: message }));
    unlisten = () => {
      offSnap();
      offFatal();
    };
  },

  setPaused: (paused) => set((s) => ({ paused, version: s.version + 1 })),

  resize: (capacity) => {
    const { bank } = get();
    if (bank.capacity !== capacity) set((s) => ({ bank: bank.resized(capacity), version: s.version + 1 }));
  },

  clear: () => set((s) => ({ bank: new SeriesBank(s.bank.capacity), version: s.version + 1 })),
}));
