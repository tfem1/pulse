/**
 * TypeScript mirrors of the Rust models in crates/pulse-core/src/models.rs
 * (serialised in camelCase). `null` means "not available on this platform".
 */

export interface SystemInfo {
  hostname: string | null;
  osName: string | null;
  osVersion: string | null;
  longOsVersion: string | null;
  kernelVersion: string | null;
  arch: string;
  cpuBrand: string;
  cpuVendor: string;
  physicalCores: number | null;
  logicalCores: number;
  totalMemory: number;
  totalSwap: number;
  bootTime: number | null;
  gpuBackends: string[];
  sensorSource: string | null;
  isElevated: boolean;
}

export interface CpuSnapshot {
  total: number;
  perCore: number[];
  frequenciesMhz: number[];
  loadAvg: [number, number, number] | null;
}

export interface MemoryBreakdown {
  cached: number | null;
  buffers: number | null;
  shared: number | null;
  committed: number | null;
  commitLimit: number | null;
  kernel: number | null;
  dirty: number | null;
}

export interface MemorySnapshot {
  total: number;
  used: number;
  available: number;
  free: number;
  swapTotal: number;
  swapUsed: number;
  breakdown: MemoryBreakdown | null;
}

export interface DiskSnapshot {
  name: string;
  mountPoint: string;
  fileSystem: string;
  kind: 'ssd' | 'hdd' | 'unknown';
  total: number;
  available: number;
  removable: boolean;
  readOnly: boolean;
  readBps: number;
  writeBps: number;
  totalRead: number;
  totalWritten: number;
}

export interface NetworkSnapshot {
  name: string;
  rxBps: number;
  txBps: number;
  totalRx: number;
  totalTx: number;
  packetsRxPs: number;
  packetsTxPs: number;
  totalErrorsRx: number;
  totalErrorsTx: number;
  mac: string;
  ips: string[];
  mtu: number;
  linkSpeedBps: number | null;
  state: string;
  isLoopback: boolean;
  isVirtual: boolean;
}

export interface GpuSnapshot {
  index: number;
  name: string;
  vendor: string;
  backend: string;
  usage: number | null;
  memoryUsed: number | null;
  memoryTotal: number | null;
  temperatureC: number | null;
  powerW: number | null;
  powerLimitW: number | null;
  fanPercent: number | null;
  clockMhz: number | null;
}

export type SensorKind = 'temperature' | 'fan' | 'voltage' | 'power' | 'current' | 'load' | 'clock' | 'other';

export interface SensorReading {
  id: string;
  chip: string;
  label: string;
  kind: SensorKind;
  value: number;
  unit: string;
  min: number | null;
  max: number | null;
  critical: number | null;
}

export interface SensorData {
  readings: SensorReading[];
  source: string | null;
  message: string | null;
}

export interface SelfUsage {
  cpuPercent: number;
  memoryBytes: number;
}

export interface Snapshot {
  timestampMs: number;
  uptimeSecs: number;
  cpu: CpuSnapshot;
  memory: MemorySnapshot;
  disks: DiskSnapshot[] | null;
  networks: NetworkSnapshot[] | null;
  gpus: GpuSnapshot[] | null;
  sensors: SensorData | null;
  diskReadBps: number;
  diskWriteBps: number;
  netRxBps: number;
  netTxBps: number;
  processCount: number;
  selfUsage: SelfUsage;
}

export interface ProcessInfo {
  pid: number;
  parent: number | null;
  name: string;
  user: string | null;
  cpu: number;
  memory: number;
  virtualMemory: number;
  diskReadBps: number;
  diskWriteBps: number;
  status: string;
  startTime: number;
  runTime: number;
  cmd: string;
  exe: string | null;
  threads: number | null;
  isSystem: boolean;
  /** User-facing application (owns a window / uses a GUI toolkit). */
  gui: boolean;
  /** Main window title, when known (Windows). */
  title: string | null;
}

export interface EndAppOutcome {
  ended: boolean;
  forced: number;
  failed: number[];
  error: string | null;
}

export type Priority = 'idle' | 'belowNormal' | 'normal' | 'aboveNormal' | 'high' | 'realtime';
export const PRIORITIES: Priority[] = ['idle', 'belowNormal', 'normal', 'aboveNormal', 'high', 'realtime'];

export interface ListeningPort {
  protocol: string;
  address: string;
  port: number;
  pid: number | null;
}

export interface ConnectionSummary {
  tcpStates: [string, number][];
  tcpTotal: number;
  tcp6Total: number;
  udpTotal: number;
  udp6Total: number;
  listening: ListeningPort[];
}

export interface DirEntrySize {
  name: string;
  path: string;
  size: number;
  isDir: boolean;
  items: number;
}

export interface ScanResult {
  path: string;
  totalSize: number;
  totalItems: number;
  entries: DirEntrySize[];
  truncated: boolean;
  errors: number;
  elapsedMs: number;
}

export interface HistoryPoint {
  timestampMs: number;
  cpu: number;
  perCore: number[];
  memUsed: number;
  memTotal: number;
  swapUsed: number;
  swapTotal: number;
  diskReadBps: number;
  diskWriteBps: number;
  netRxBps: number;
  netTxBps: number;
  gpuUsage: number | null;
  gpuMemUsed: number | null;
  gpuTempC: number | null;
}

// ---------------------------------------------------------------- alerts ---

export type AlertMetric =
  | 'cpuTotal'
  | 'memoryPercent'
  | 'swapPercent'
  | 'diskUsagePercent'
  | 'diskRead'
  | 'diskWrite'
  | 'netRx'
  | 'netTx'
  | 'gpuUsage'
  | 'gpuTemperature'
  | 'temperature';

export const ALERT_METRICS: AlertMetric[] = [
  'cpuTotal',
  'memoryPercent',
  'swapPercent',
  'diskUsagePercent',
  'diskRead',
  'diskWrite',
  'netRx',
  'netTx',
  'gpuUsage',
  'gpuTemperature',
  'temperature',
];

export type Comparator = 'above' | 'below';
export type AlertAction = 'notify' | 'log';

export interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  metric: AlertMetric;
  target: string | null;
  comparator: Comparator;
  threshold: number;
  durationSecs: number;
  cooldownSecs: number;
  action: AlertAction;
}

export interface AlertEvent {
  ruleId: string;
  ruleName: string;
  kind: 'fired' | 'resolved';
  metric: AlertMetric;
  value: number | null;
  threshold: number;
  timestampMs: number;
  action: AlertAction;
}

export interface RuleStatus {
  ruleId: string;
  firing: boolean;
  breaching: boolean;
  lastValue: number | null;
  lastFiredMs: number | null;
}

// ---------------------------------------------------------------- config ---

export interface MonitoringConfig {
  refreshMs: number;
  historyMinutes: number;
  sampleDisks: boolean;
  sampleNetwork: boolean;
  sampleGpu: boolean;
  sampleSensors: boolean;
  sensorEvery: number;
  closeToTray: boolean;
  trayStats: boolean;
}

export type ProcessSortKey = 'name' | 'pid' | 'user' | 'status' | 'cpu' | 'memory' | 'disk' | 'threads';

export interface ProcessConfig {
  defaultSort: ProcessSortKey;
  sortDescending: boolean;
  confirmKill: boolean;
  showSystem: boolean;
  treeView: boolean;
}

export interface NotificationConfig {
  enabled: boolean;
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  cpuThreshold: number;
  memoryThreshold: number;
  temperatureThreshold: number;
  defaultCooldownSecs: number;
}

export interface Config {
  version: number;
  monitoring: MonitoringConfig;
  processes: ProcessConfig;
  notifications: NotificationConfig;
  alerts: AlertRule[];
  about: { updateCheck: boolean };
}

export interface AppPaths {
  configFile: string;
  configDir: string;
}

export interface AppInfo {
  name: string;
  version: string;
  tauriVersion: string;
  targetOs: string;
  targetArch: string;
  debug: boolean;
  trayAvailable: boolean;
}

export type ExportFormat = 'csv' | 'json';

/** Error shape produced by PulseError on the Rust side. */
export interface BackendError {
  kind: 'permissionDenied' | 'notFound' | 'unsupported' | 'invalidInput' | 'io' | 'other';
  message: string;
}

export function isBackendError(e: unknown): e is BackendError {
  return typeof e === 'object' && e !== null && 'kind' in e && 'message' in e;
}

export function errorMessage(e: unknown): string {
  if (isBackendError(e)) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}
