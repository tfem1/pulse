import type { TKey } from '@/i18n';
import type { AlertMetric } from './types';

export interface MetricMeta {
  labelKey: TKey;
  unit: string;
  /** Optional target (mount point, interface, GPU index, sensor id). */
  targetKey?: TKey;
  defaultThreshold: number;
  max?: number;
}

export const METRIC_META: Record<AlertMetric, MetricMeta> = {
  cpuTotal: { labelKey: 'alertMetric.cpuTotal', unit: '%', defaultThreshold: 90, max: 100 },
  memoryPercent: { labelKey: 'alertMetric.memoryPercent', unit: '%', defaultThreshold: 90, max: 100 },
  swapPercent: { labelKey: 'alertMetric.swapPercent', unit: '%', defaultThreshold: 50, max: 100 },
  diskUsagePercent: {
    labelKey: 'alertMetric.diskUsagePercent',
    unit: '%',
    targetKey: 'alerts.targetMount',
    defaultThreshold: 95,
    max: 100,
  },
  diskRead: { labelKey: 'alertMetric.diskRead', unit: 'MB/s', defaultThreshold: 200 },
  diskWrite: { labelKey: 'alertMetric.diskWrite', unit: 'MB/s', defaultThreshold: 200 },
  netRx: {
    labelKey: 'alertMetric.netRx',
    unit: 'MB/s',
    targetKey: 'alerts.targetInterface',
    defaultThreshold: 50,
  },
  netTx: {
    labelKey: 'alertMetric.netTx',
    unit: 'MB/s',
    targetKey: 'alerts.targetInterface',
    defaultThreshold: 20,
  },
  gpuUsage: {
    labelKey: 'alertMetric.gpuUsage',
    unit: '%',
    targetKey: 'alerts.targetGpu',
    defaultThreshold: 95,
    max: 100,
  },
  gpuTemperature: {
    labelKey: 'alertMetric.gpuTemperature',
    unit: '°C',
    targetKey: 'alerts.targetGpu',
    defaultThreshold: 85,
  },
  temperature: {
    labelKey: 'alertMetric.temperature',
    unit: '°C',
    targetKey: 'alerts.targetSensor',
    defaultThreshold: 90,
  },
};

export function formatAlertValue(metric: AlertMetric, v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const { unit } = METRIC_META[metric];
  const digits = unit === 'MB/s' ? 1 : 0;
  return `${v.toFixed(digits)}${unit === '%' ? '%' : ` ${unit}`}`;
}
