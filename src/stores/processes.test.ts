/**
 * Process streaming must never be left running when the views that need it
 * unmount while the start-up IPC calls are still pending.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const calls: string[] = [];
let listenGate: Deferred<void>;
let streamingGate: Deferred<void>;
let listening = 0;

vi.mock('@/lib/api', () => ({
  backend: () => ({
    onProcesses: async () => {
      await listenGate.promise;
      listening++;
      calls.push('listen');
      return () => {
        listening--;
        calls.push('unlisten');
      };
    },
    setProcessStreaming: async (on: boolean) => {
      calls.push(on ? 'stream:on' : 'stream:off');
      if (on) await streamingGate.promise;
    },
    getProcesses: async () => [],
  }),
}));

const { useProcesses } = await import('./processes');
const flush = () => new Promise((r) => setTimeout(r, 0));

/** Streaming state as the backend would end up seeing it. */
const backendStreaming = () => calls.filter((c) => c.startsWith('stream:')).at(-1) === 'stream:on';

beforeEach(() => {
  calls.length = 0;
  listening = 0;
  listenGate = deferred();
  streamingGate = deferred();
  useProcesses.setState({ subscribers: 0, processes: [], updatedAt: null });
});

describe('process streaming lifecycle', () => {
  it('starts and stops normally', async () => {
    const started = useProcesses.getState().start();
    listenGate.resolve();
    streamingGate.resolve();
    await started;
    expect(listening).toBe(1);
    expect(backendStreaming()).toBe(true);

    useProcesses.getState().stop();
    await flush();
    expect(listening).toBe(0);
    expect(backendStreaming()).toBe(false);
  });

  it('cleans up when the view unmounts before the listener is registered', async () => {
    const started = useProcesses.getState().start();
    useProcesses.getState().stop(); // leave the page immediately
    listenGate.resolve();
    streamingGate.resolve();
    await started;
    await flush();
    expect(listening).toBe(0);
    expect(backendStreaming()).toBe(false);
  });

  it('cleans up when the view unmounts while streaming is being enabled', async () => {
    const started = useProcesses.getState().start();
    listenGate.resolve();
    await flush(); // listener registered, "stream:on" in flight
    useProcesses.getState().stop();
    streamingGate.resolve();
    await started;
    await flush();
    expect(listening).toBe(0);
    expect(backendStreaming()).toBe(false);
  });

  it('keeps exactly one listener after leave-and-return', async () => {
    const first = useProcesses.getState().start();
    useProcesses.getState().stop();
    const second = useProcesses.getState().start(); // back on the page
    listenGate.resolve();
    streamingGate.resolve();
    await Promise.all([first, second]);
    await flush();
    expect(listening).toBe(1);
    expect(backendStreaming()).toBe(true);
  });

  it('drops the cached list when the last view leaves', async () => {
    const started = useProcesses.getState().start();
    listenGate.resolve();
    streamingGate.resolve();
    await started;
    useProcesses.setState({ processes: [{ pid: 1 } as never], updatedAt: 1 });
    useProcesses.getState().stop();
    expect(useProcesses.getState().processes).toEqual([]);
  });
});
