/**
 * Typed client for the Rust backend.
 *
 * Inside Tauri every call goes through `invoke` / `listen`. In a plain
 * browser (e.g. `npm run dev` without Tauri, or UI tests) a clearly
 * labelled demo backend generates synthetic data so every page can still
 * be exercised.
 */
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  AlertEvent,
  AppInfo,
  AppPaths,
  Config,
  ConnectionSummary,
  EndAppOutcome,
  ExportFormat,
  HistoryPoint,
  Priority,
  ProcessInfo,
  RuleStatus,
  ScanResult,
  Snapshot,
  SystemInfo,
} from './types';

export type Unlisten = UnlistenFn;

export interface Backend {
  readonly isDemo: boolean;
  getSystemInfo(): Promise<SystemInfo | null>;
  getSnapshot(): Promise<Snapshot | null>;
  getHistory(sinceMs?: number): Promise<HistoryPoint[]>;
  clearHistory(): Promise<void>;
  getProcesses(): Promise<ProcessInfo[]>;
  setProcessStreaming(enabled: boolean): Promise<void>;
  killProcess(pid: number, force: boolean): Promise<void>;
  /** End a whole app: ask `primary` to close, terminate leftovers after 5 s (or at once with `force`). */
  endApp(pids: number[], primary: number[], force: boolean): Promise<EndAppOutcome>;
  suspendProcess(pid: number): Promise<void>;
  resumeProcess(pid: number): Promise<void>;
  setProcessPriority(pid: number, priority: Priority): Promise<void>;
  getProcessPriority(pid: number): Promise<Priority>;
  getConfig(): Promise<Config>;
  updateConfig(config: Config): Promise<Config>;
  getConnections(): Promise<ConnectionSummary>;
  scanDirectory(path: string): Promise<ScanResult>;
  exportMetrics(path: string, format: ExportFormat): Promise<number>;
  getPaths(): Promise<AppPaths>;
  getAlertEvents(): Promise<AlertEvent[]>;
  clearAlertEvents(): Promise<void>;
  getAlertStatus(): Promise<RuleStatus[]>;
  sendTestNotification(title: string, body: string): Promise<void>;
  getAppInfo(): Promise<AppInfo>;
  onSnapshot(cb: (s: Snapshot) => void): Promise<Unlisten>;
  onProcesses(cb: (p: ProcessInfo[]) => void): Promise<Unlisten>;
  onAlert(cb: (e: AlertEvent) => void): Promise<Unlisten>;
  onFatal(cb: (message: string) => void): Promise<Unlisten>;
  pickSavePath(defaultName: string, format: ExportFormat): Promise<string | null>;
  pickDirectory(): Promise<string | null>;
  openUrl(url: string): Promise<void>;
  revealPath(path: string): Promise<void>;
}

export const EVENTS = {
  snapshot: 'pulse://snapshot',
  processes: 'pulse://processes',
  alert: 'pulse://alert',
  fatal: 'pulse://fatal',
} as const;

class TauriBackend implements Backend {
  readonly isDemo = false;

  getSystemInfo = () => invoke<SystemInfo | null>('get_system_info');
  getSnapshot = () => invoke<Snapshot | null>('get_snapshot');
  getHistory = (sinceMs?: number) => invoke<HistoryPoint[]>('get_history', { sinceMs: sinceMs ?? null });
  clearHistory = () => invoke<void>('clear_history');
  getProcesses = () => invoke<ProcessInfo[]>('get_processes');
  setProcessStreaming = (enabled: boolean) => invoke<void>('set_process_streaming', { enabled });
  killProcess = (pid: number, force: boolean) => invoke<void>('kill_process', { pid, force });
  endApp = (pids: number[], primary: number[], force: boolean) =>
    invoke<EndAppOutcome>('end_app', { pids, primary, force });
  suspendProcess = (pid: number) => invoke<void>('suspend_process', { pid });
  resumeProcess = (pid: number) => invoke<void>('resume_process', { pid });
  setProcessPriority = (pid: number, priority: Priority) =>
    invoke<void>('set_process_priority', { pid, priority });
  getProcessPriority = (pid: number) => invoke<Priority>('get_process_priority', { pid });
  getConfig = () => invoke<Config>('get_config');
  updateConfig = (config: Config) => invoke<Config>('update_config', { config });
  getConnections = () => invoke<ConnectionSummary>('get_connections');
  scanDirectory = (path: string) => invoke<ScanResult>('scan_directory', { path });
  exportMetrics = (path: string, format: ExportFormat) => invoke<number>('export_metrics', { path, format });
  getPaths = () => invoke<AppPaths>('get_paths');
  getAlertEvents = () => invoke<AlertEvent[]>('get_alert_events');
  clearAlertEvents = () => invoke<void>('clear_alert_events');
  getAlertStatus = () => invoke<RuleStatus[]>('get_alert_status');
  sendTestNotification = (title: string, body: string) =>
    invoke<void>('send_test_notification', { title, body });
  getAppInfo = () => invoke<AppInfo>('get_app_info');

  onSnapshot = (cb: (s: Snapshot) => void) => listen<Snapshot>(EVENTS.snapshot, (e) => cb(e.payload));
  onProcesses = (cb: (p: ProcessInfo[]) => void) =>
    listen<ProcessInfo[]>(EVENTS.processes, (e) => cb(e.payload));
  onAlert = (cb: (e: AlertEvent) => void) => listen<AlertEvent>(EVENTS.alert, (e) => cb(e.payload));
  onFatal = (cb: (m: string) => void) => listen<string>(EVENTS.fatal, (e) => cb(e.payload));

  async pickSavePath(defaultName: string, format: ExportFormat): Promise<string | null> {
    const { save } = await import('@tauri-apps/plugin-dialog');
    return save({
      defaultPath: defaultName,
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    });
  }

  async pickDirectory(): Promise<string | null> {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const r = await open({ directory: true, multiple: false });
    return typeof r === 'string' ? r : null;
  }

  async openUrl(url: string): Promise<void> {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  }

  async revealPath(path: string): Promise<void> {
    const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
    await revealItemInDir(path);
  }
}

let instance: Backend | null = null;

/** The active backend (created lazily). */
export async function getBackend(): Promise<Backend> {
  if (instance) return instance;
  if (isTauri()) {
    instance = new TauriBackend();
  } else {
    const { DemoBackend } = await import('./demo');
    instance = new DemoBackend();
  }
  return instance;
}

/** Synchronous access once `getBackend()` has resolved (set up at startup). */
export function backend(): Backend {
  if (!instance) throw new Error('backend not initialised; await getBackend() first');
  return instance;
}
