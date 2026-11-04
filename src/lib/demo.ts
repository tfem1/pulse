/**
 * Demo backend used when the UI runs outside Tauri (plain browser).
 * Produces plausible, smoothly varying synthetic data. The UI shows a
 * "Demo data" badge whenever this backend is active.
 */
import type { Backend, Unlisten } from './api';
import type {
  AlertEvent,
  AlertRule,
  AppInfo,
  AppPaths,
  Config,
  ConnectionSummary,
  DiskSnapshot,
  ExportFormat,
  GpuSnapshot,
  HistoryPoint,
  NetworkSnapshot,
  Priority,
  ProcessInfo,
  RuleStatus,
  ScanResult,
  SensorReading,
  Snapshot,
  SystemInfo,
} from './types';

const GiB = 1024 ** 3;
const MiB = 1024 ** 2;
const CORES = 8;

function walk(v: number, step: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v + (Math.random() - 0.5) * step));
}

export const DEFAULT_RULES: AlertRule[] = [
  {
    id: 'default-cpu',
    name: 'Sustained high CPU',
    enabled: true,
    metric: 'cpuTotal',
    target: null,
    comparator: 'above',
    threshold: 90,
    durationSecs: 30,
    cooldownSecs: 300,
    action: 'notify',
  },
  {
    id: 'default-memory',
    name: 'Memory almost full',
    enabled: true,
    metric: 'memoryPercent',
    target: null,
    comparator: 'above',
    threshold: 90,
    durationSecs: 15,
    cooldownSecs: 300,
    action: 'notify',
  },
  {
    id: 'default-disk',
    name: 'Disk almost full',
    enabled: true,
    metric: 'diskUsagePercent',
    target: null,
    comparator: 'above',
    threshold: 95,
    durationSecs: 0,
    cooldownSecs: 3600,
    action: 'notify',
  },
];

/** Mirrors `Config::default()` in crates/pulse-core/src/config.rs. */
export function defaultConfig(): Config {
  return {
    version: 1,
    monitoring: {
      refreshMs: 1000,
      historyMinutes: 15,
      sampleDisks: true,
      sampleNetwork: true,
      sampleGpu: true,
      sampleSensors: true,
      sensorEvery: 2,
      closeToTray: true,
      trayStats: true,
    },
    processes: {
      defaultSort: 'cpu',
      sortDescending: true,
      confirmKill: true,
      showSystem: true,
      treeView: false,
    },
    notifications: {
      enabled: true,
      quietHoursEnabled: false,
      quietStart: '22:00',
      quietEnd: '07:00',
      cpuThreshold: 90,
      memoryThreshold: 90,
      temperatureThreshold: 85,
      defaultCooldownSecs: 300,
    },
    alerts: structuredClone(DEFAULT_RULES),
    about: { updateCheck: false },
  };
}

const PROC_NAMES = [
  ['systemd', 'root', true],
  ['kthreadd', 'root', true],
  ['Xwayland', 'demo', false],
  ['gnome-shell', 'demo', false],
  ['pipewire', 'demo', false],
  ['firefox', 'demo', false],
  ['Web Content', 'demo', false],
  ['Web Content', 'demo', false],
  ['code', 'demo', false],
  ['rust-analyzer', 'demo', false],
  ['cargo', 'demo', false],
  ['node', 'demo', false],
  ['postgres', 'postgres', true],
  ['dockerd', 'root', true],
  ['containerd', 'root', true],
  ['sshd', 'root', true],
  ['NetworkManager', 'root', true],
  ['pulse', 'demo', false],
  ['spotify', 'demo', false],
  ['slack', 'demo', false],
  ['bash', 'demo', false],
  ['zsh', 'demo', false],
  ['htop', 'demo', false],
  ['journald', 'root', true],
  ['udisksd', 'root', true],
  ['cupsd', 'root', true],
  ['thunderbird', 'demo', false],
  ['obsidian', 'demo', false],
] as const;

export class DemoBackend implements Backend {
  readonly isDemo = true;
  private config: Config = defaultConfig();
  private tick = 0;
  private cpu = Array.from({ length: CORES }, () => 10 + Math.random() * 20);
  private mem = 7.4 * GiB;
  private gpu = 18;
  private temps = { pkg: 52, nvme: 41, gpu: 48 };
  private history: HistoryPoint[] = [];
  private procs: ProcessInfo[];
  private priorities = new Map<number, Priority>();
  private snapshotCbs = new Set<(s: Snapshot) => void>();
  private processCbs = new Set<(p: ProcessInfo[]) => void>();
  private streaming = false;
  private last: Snapshot | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private started = Date.now();
  private totals = { rx: 48 * GiB, tx: 6 * GiB, read: 120 * GiB, written: 80 * GiB };

  constructor() {
    this.procs = PROC_NAMES.map(([name, user, sys], i) => ({
      pid: i < 2 ? i + 1 : 400 + i * 37,
      parent: i < 2 ? (i === 0 ? null : 0) : i % 5 === 0 ? 1 : 400 + Math.max(2, i - 3) * 37,
      name,
      user,
      cpu: Math.random() * (name.includes('Web') || name === 'firefox' ? 8 : 2),
      memory: (20 + Math.random() * 600) * MiB,
      virtualMemory: (200 + Math.random() * 3000) * MiB,
      diskReadBps: 0,
      diskWriteBps: 0,
      status: 'sleeping',
      startTime: Math.floor(this.started / 1000) - Math.floor(Math.random() * 86400),
      runTime: Math.floor(Math.random() * 86400),
      cmd: `/usr/bin/${name.toLowerCase().replace(/\s/g, '-')} --demo`,
      exe: `/usr/bin/${name.toLowerCase().replace(/\s/g, '-')}`,
      threads: 1 + Math.floor(Math.random() * 40),
      isSystem: sys,
    }));
    // Seed 3 minutes of history so charts are populated immediately.
    const now = Date.now();
    for (let i = 180; i > 0; i--) this.history.push(this.point(this.step(now - i * 1000)));
    this.schedule();
  }

  private schedule() {
    this.timer = setTimeout(() => {
      const s = this.step(Date.now());
      this.history.push(this.point(s));
      const cap = Math.floor(
        (this.config.monitoring.historyMinutes * 60000) / this.config.monitoring.refreshMs,
      );
      if (this.history.length > cap) this.history.splice(0, this.history.length - cap);
      this.snapshotCbs.forEach((cb) => cb(s));
      if (this.streaming) this.processCbs.forEach((cb) => cb(this.procs.map((p) => ({ ...p }))));
      this.schedule();
    }, this.config.monitoring.refreshMs);
  }

  private point(s: Snapshot): HistoryPoint {
    const g = s.gpus?.[0];
    return {
      timestampMs: s.timestampMs,
      cpu: s.cpu.total,
      perCore: s.cpu.perCore,
      memUsed: s.memory.used,
      memTotal: s.memory.total,
      swapUsed: s.memory.swapUsed,
      swapTotal: s.memory.swapTotal,
      diskReadBps: s.diskReadBps,
      diskWriteBps: s.diskWriteBps,
      netRxBps: s.netRxBps,
      netTxBps: s.netTxBps,
      gpuUsage: g?.usage ?? null,
      gpuMemUsed: g?.memoryUsed ?? null,
      gpuTempC: g?.temperatureC ?? null,
    };
  }

  private step(ts: number): Snapshot {
    this.tick++;
    const burst = Math.sin(this.tick / 40) > 0.85 ? 45 : 0;
    this.cpu = this.cpu.map(
      (c, i) => walk(c, 14, 2, Math.min(100, 70 + burst + (i % 3) * 5)) + (burst ? 0.5 : 0),
    );
    const total = this.cpu.reduce((a, b) => a + b, 0) / CORES;
    this.mem = walk(this.mem, 0.15 * GiB, 5 * GiB, 13 * GiB);
    this.gpu = walk(this.gpu, 10, 2, 95);
    this.temps.pkg = walk(this.temps.pkg + (total - 25) * 0.02, 1.2, 38, 92);
    this.temps.nvme = walk(this.temps.nvme, 0.4, 35, 60);
    this.temps.gpu = walk(this.temps.gpu + (this.gpu - 30) * 0.01, 0.8, 35, 85);
    const r = (scale: number) => Math.max(0, Math.random() ** 3 * scale);

    const rx = r(6 * MiB) + 20e3;
    const tx = r(1 * MiB) + 5e3;
    const read = r(80 * MiB);
    const write = r(40 * MiB);
    this.totals.rx += rx;
    this.totals.tx += tx;
    this.totals.read += read;
    this.totals.written += write;

    const disks: DiskSnapshot[] = [
      {
        name: 'nvme0n1p2',
        mountPoint: '/',
        fileSystem: 'ext4',
        kind: 'ssd',
        total: 476 * GiB,
        available: 188 * GiB,
        removable: false,
        readOnly: false,
        readBps: read * 0.8,
        writeBps: write * 0.8,
        totalRead: this.totals.read,
        totalWritten: this.totals.written,
      },
      {
        name: 'sda1',
        mountPoint: '/mnt/archive',
        fileSystem: 'btrfs',
        kind: 'hdd',
        total: 1863 * GiB,
        available: 92 * GiB,
        removable: false,
        readOnly: false,
        readBps: read * 0.2,
        writeBps: write * 0.2,
        totalRead: this.totals.read / 3,
        totalWritten: this.totals.written / 4,
      },
      {
        name: 'sdb1',
        mountPoint: '/media/usb',
        fileSystem: 'vfat',
        kind: 'unknown',
        total: 58 * GiB,
        available: 41 * GiB,
        removable: true,
        readOnly: false,
        readBps: 0,
        writeBps: 0,
        totalRead: 2 * GiB,
        totalWritten: 1 * GiB,
      },
    ];
    const net = (
      name: string,
      rxBps: number,
      txBps: number,
      extra: Partial<NetworkSnapshot>,
    ): NetworkSnapshot => ({
      name,
      rxBps,
      txBps,
      totalRx: this.totals.rx * (rxBps / (rx || 1)),
      totalTx: this.totals.tx * (txBps / (tx || 1)),
      packetsRxPs: rxBps / 900,
      packetsTxPs: txBps / 700,
      totalErrorsRx: 0,
      totalErrorsTx: 0,
      mac: '3c:52:82:aa:10:4f',
      ips: [],
      mtu: 1500,
      linkSpeedBps: null,
      state: 'up',
      isLoopback: false,
      isVirtual: false,
      ...extra,
    });
    const networks = [
      net('enp5s0', rx, tx, { ips: ['192.168.1.42/24', 'fe80::3e52:82ff:feaa:104f/64'], linkSpeedBps: 1e9 }),
      net('wlp4s0', 0, 0, { state: 'down', mac: '7c:b2:7d:01:9e:33' }),
      net('docker0', rx * 0.05, tx * 0.08, {
        isVirtual: true,
        ips: ['172.17.0.1/16'],
        mac: '02:42:9a:11:22:33',
      }),
      net('lo', 1200, 1200, {
        isLoopback: true,
        isVirtual: true,
        ips: ['127.0.0.1/8', '::1/128'],
        mac: '00:00:00:00:00:00',
        mtu: 65536,
      }),
    ];
    const gpus: GpuSnapshot[] = [
      {
        index: 0,
        name: 'Demo GPU 8 GB',
        vendor: 'NVIDIA',
        backend: 'nvml',
        usage: this.gpu,
        memoryUsed: (1.2 + this.gpu / 30) * GiB,
        memoryTotal: 8 * GiB,
        temperatureC: this.temps.gpu,
        powerW: 20 + this.gpu * 1.6,
        powerLimitW: 200,
        fanPercent: Math.round(30 + this.gpu / 3),
        clockMhz: Math.round(1200 + this.gpu * 8),
      },
    ];
    const sens = (
      id: string,
      chip: string,
      label: string,
      kind: SensorReading['kind'],
      value: number,
      unit: string,
      critical: number | null = null,
    ): SensorReading => ({ id, chip, label, kind, value, unit, min: null, max: null, critical });
    const sensors: SensorReading[] = [
      sens('hwmon2/temp1', 'coretemp', 'Package id 0', 'temperature', this.temps.pkg, '°C', 100),
      ...Array.from({ length: 4 }, (_, i) =>
        sens(
          `hwmon2/temp${i + 2}`,
          'coretemp',
          `Core ${i}`,
          'temperature',
          this.temps.pkg - 3 + i,
          '°C',
          100,
        ),
      ),
      sens('hwmon1/temp1', 'nvme', 'Composite', 'temperature', this.temps.nvme, '°C', 84.85),
      sens('hwmon3/fan1', 'nct6798', 'CPU fan', 'fan', 900 + total * 9, 'RPM'),
      sens('hwmon3/fan2', 'nct6798', 'Chassis fan', 'fan', 650 + total * 3, 'RPM'),
      sens('hwmon3/in0', 'nct6798', 'Vcore', 'voltage', 1.05 + Math.random() * 0.06, 'V'),
      sens('hwmon3/in1', 'nct6798', '+12V', 'voltage', 12.1 + Math.random() * 0.05, 'V'),
      sens('gpu0/temp', 'GPU 0 · Demo GPU 8 GB', 'GPU core', 'temperature', this.temps.gpu, '°C'),
      sens('gpu0/power', 'GPU 0 · Demo GPU 8 GB', 'Board power', 'power', 20 + this.gpu * 1.6, 'W'),
    ];

    for (const p of this.procs) {
      if (p.status === 'suspended' || p.status === 'stopped') {
        p.cpu = 0;
        continue;
      }
      const heavy = p.name.includes('Web') || p.name === 'firefox' || p.name === 'rust-analyzer';
      p.cpu = walk(p.cpu, heavy ? 3 : 0.6, 0, heavy ? 30 : 4);
      p.memory = walk(p.memory, 4 * MiB, 8 * MiB, 2 * GiB);
      p.diskReadBps = r(heavy ? 2 * MiB : 50e3);
      p.diskWriteBps = r(heavy ? 1 * MiB : 20e3);
      p.status = p.cpu > 3 ? 'running' : 'sleeping';
      p.runTime += this.config.monitoring.refreshMs / 1000;
    }

    const s: Snapshot = {
      timestampMs: ts,
      uptimeSecs: Math.floor((ts - this.started) / 1000) + 3 * 3600 + 1234,
      cpu: {
        total,
        perCore: [...this.cpu],
        frequenciesMhz: this.cpu.map((c) => Math.round(2200 + c * 25)),
        loadAvg: [total / 25, total / 28, total / 30],
      },
      memory: {
        total: 16 * GiB,
        used: this.mem,
        available: 16 * GiB - this.mem,
        free: (16 * GiB - this.mem) * 0.3,
        swapTotal: 4 * GiB,
        swapUsed: 0.3 * GiB,
        breakdown: {
          cached: 3.1 * GiB,
          buffers: 0.2 * GiB,
          shared: 0.6 * GiB,
          committed: 11.2 * GiB,
          commitLimit: 12 * GiB,
          kernel: 0.5 * GiB,
          dirty: 2 * MiB,
        },
      },
      disks: this.config.monitoring.sampleDisks ? disks : null,
      networks: this.config.monitoring.sampleNetwork ? networks : null,
      gpus: this.config.monitoring.sampleGpu ? gpus : null,
      sensors: this.config.monitoring.sampleSensors
        ? { readings: sensors, source: 'demo', message: null }
        : null,
      diskReadBps: read,
      diskWriteBps: write,
      netRxBps: rx + rx * 0.05,
      netTxBps: tx + tx * 0.08,
      processCount: this.procs.length,
      selfUsage: { cpuPercent: 0.4 + Math.random() * 0.3, memoryBytes: 92 * MiB },
    };
    this.last = s;
    return s;
  }

  private find(pid: number): ProcessInfo {
    const p = this.procs.find((x) => x.pid === pid);
    if (!p) throw { kind: 'notFound', message: `process ${pid} no longer exists` };
    if (p.pid === 1)
      throw {
        kind: 'permissionDenied',
        message: 'refusing to end PID 1 (init); doing so would bring down the system',
      };
    if (p.user === 'root')
      throw {
        kind: 'permissionDenied',
        message: `cannot manage process ${pid}: it belongs to another user. Run Pulse as root (e.g. with sudo) to manage it.`,
      };
    return p;
  }

  async getSystemInfo(): Promise<SystemInfo> {
    return {
      hostname: 'demo-host',
      osName: 'Demo Linux',
      osVersion: '24.04',
      longOsVersion: 'Demo Linux 24.04 LTS',
      kernelVersion: '6.8.0-demo',
      arch: 'x86_64',
      cpuBrand: 'Demo CPU 8-Core Processor',
      cpuVendor: 'DemoVendor',
      physicalCores: 4,
      logicalCores: CORES,
      totalMemory: 16 * GiB,
      totalSwap: 4 * GiB,
      bootTime: Math.floor(this.started / 1000) - 3 * 3600,
      gpuBackends: ['NVML'],
      sensorSource: 'demo',
      isElevated: false,
    };
  }
  async getSnapshot() {
    return this.last;
  }
  async getHistory(sinceMs?: number) {
    return sinceMs == null ? [...this.history] : this.history.filter((p) => p.timestampMs > sinceMs);
  }
  async clearHistory() {
    this.history = [];
  }
  async getProcesses() {
    return this.procs.map((p) => ({ ...p }));
  }
  async setProcessStreaming(enabled: boolean) {
    this.streaming = enabled;
  }
  async killProcess(pid: number) {
    this.find(pid);
    this.procs = this.procs.filter((p) => p.pid !== pid);
  }
  async suspendProcess(pid: number) {
    this.find(pid).status = 'suspended';
  }
  async resumeProcess(pid: number) {
    this.find(pid).status = 'sleeping';
  }
  async setProcessPriority(pid: number, priority: Priority) {
    this.find(pid);
    if (priority === 'high' || priority === 'realtime' || priority === 'aboveNormal')
      throw {
        kind: 'permissionDenied',
        message: `raising the priority of process ${pid} requires root (or CAP_SYS_NICE). Lowering it is always allowed for your own processes.`,
      };
    this.priorities.set(pid, priority);
  }
  async getProcessPriority(pid: number) {
    return this.priorities.get(pid) ?? 'normal';
  }
  async getConfig() {
    return structuredClone(this.config);
  }
  async updateConfig(config: Config) {
    const restart = config.monitoring.refreshMs !== this.config.monitoring.refreshMs;
    this.config = structuredClone(config);
    if (restart && this.timer) {
      clearTimeout(this.timer);
      this.schedule();
    }
    return structuredClone(this.config);
  }
  async getConnections(): Promise<ConnectionSummary> {
    return {
      tcpStates: [
        ['ESTABLISHED', 42 + Math.round(Math.random() * 6)],
        ['LISTEN', 9],
        ['TIME_WAIT', 7],
        ['CLOSE_WAIT', 2],
      ],
      tcpTotal: 38,
      tcp6Total: 22,
      udpTotal: 11,
      udp6Total: 6,
      listening: [
        { protocol: 'tcp', address: '0.0.0.0', port: 22, pid: null },
        { protocol: 'tcp', address: '127.0.0.1', port: 631, pid: null },
        { protocol: 'tcp', address: '127.0.0.1', port: 5432, pid: null },
        { protocol: 'tcp6', address: '::', port: 22, pid: null },
        { protocol: 'udp', address: '0.0.0.0', port: 5353, pid: null },
        { protocol: 'tcp', address: '127.0.0.1', port: 1420, pid: null },
      ],
    };
  }
  async scanDirectory(path: string): Promise<ScanResult> {
    await new Promise((r) => setTimeout(r, 600));
    const names = [
      '.cache',
      'Videos',
      'Projects',
      'Downloads',
      'Pictures',
      '.local',
      'Documents',
      '.cargo',
      'Music',
    ];
    const entries = names.map((name, i) => ({
      name,
      path: `${path.replace(/\/$/, '')}/${name}`,
      size: Math.round((40 / (i + 1)) * GiB * (0.7 + Math.random() * 0.6)),
      isDir: true,
      items: Math.round(5000 / (i + 1)),
    }));
    entries.sort((a, b) => b.size - a.size);
    return {
      path,
      totalSize: entries.reduce((a, e) => a + e.size, 0),
      totalItems: 48211,
      entries,
      truncated: false,
      errors: 3,
      elapsedMs: 612,
    };
  }
  async exportMetrics(path: string, format: ExportFormat) {
    const data =
      format === 'json'
        ? JSON.stringify({ app: 'pulse', samples: this.history }, null, 2)
        : [
            'timestamp_ms,cpu_percent',
            ...this.history.map((p) => `${p.timestampMs},${p.cpu.toFixed(2)}`),
          ].join('\n');
    const url = URL.createObjectURL(
      new Blob([data], { type: format === 'json' ? 'application/json' : 'text/csv' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = path;
    a.click();
    URL.revokeObjectURL(url);
    return this.history.length;
  }
  async getPaths(): Promise<AppPaths> {
    return { configFile: '~/.config/dev.pulse.app/config.json (demo)', configDir: '~/.config/dev.pulse.app' };
  }
  async getAlertEvents(): Promise<AlertEvent[]> {
    const now = Date.now();
    return [
      {
        ruleId: 'default-cpu',
        ruleName: 'Sustained high CPU',
        kind: 'fired',
        metric: 'cpuTotal',
        value: 94.2,
        threshold: 90,
        timestampMs: now - 42 * 60000,
        action: 'notify',
      },
      {
        ruleId: 'default-cpu',
        ruleName: 'Sustained high CPU',
        kind: 'resolved',
        metric: 'cpuTotal',
        value: 31.5,
        threshold: 90,
        timestampMs: now - 40 * 60000,
        action: 'notify',
      },
    ];
  }
  async clearAlertEvents() {}
  async getAlertStatus(): Promise<RuleStatus[]> {
    const s = this.last;
    return this.config.alerts.map((r) => {
      const v =
        r.metric === 'cpuTotal' && s
          ? s.cpu.total
          : r.metric === 'memoryPercent' && s
            ? (s.memory.used / s.memory.total) * 100
            : r.metric === 'diskUsagePercent'
              ? 95.1
              : null;
      return {
        ruleId: r.id,
        firing: r.metric === 'diskUsagePercent' && r.enabled,
        breaching: r.metric === 'diskUsagePercent' && r.enabled,
        lastValue: v,
        lastFiredMs: r.metric === 'diskUsagePercent' ? Date.now() - 5 * 60000 : null,
      };
    });
  }
  async sendTestNotification(title: string, body: string) {
    if ('Notification' in window) {
      if (Notification.permission !== 'granted') await Notification.requestPermission();
      if (Notification.permission === 'granted') new Notification(title, { body });
      else throw { kind: 'permissionDenied', message: 'The browser blocked notifications.' };
    }
  }
  async getAppInfo(): Promise<AppInfo> {
    return {
      name: 'Pulse',
      version: '0.1.0',
      tauriVersion: 'n/a (browser demo)',
      targetOs: 'browser',
      targetArch: 'wasm',
      debug: true,
      trayAvailable: false,
    };
  }
  async onSnapshot(cb: (s: Snapshot) => void): Promise<Unlisten> {
    this.snapshotCbs.add(cb);
    return () => this.snapshotCbs.delete(cb);
  }
  async onProcesses(cb: (p: ProcessInfo[]) => void): Promise<Unlisten> {
    this.processCbs.add(cb);
    return () => this.processCbs.delete(cb);
  }
  async onAlert(): Promise<Unlisten> {
    return () => {};
  }
  async onFatal(): Promise<Unlisten> {
    return () => {};
  }
  async pickSavePath(defaultName: string) {
    return defaultName;
  }
  async pickDirectory() {
    return '/home/demo';
  }
  async openUrl(url: string) {
    window.open(url, '_blank', 'noopener');
  }
  async revealPath() {}
}
