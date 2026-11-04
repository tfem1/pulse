import { describe, expect, it } from 'vitest';
import {
  formatBits,
  formatBytes,
  formatDuration,
  formatMhz,
  formatPercent,
  formatRate,
  formatSensor,
} from './format';

describe('format', () => {
  it('formats bytes with binary units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1,023 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 ** 3)).toBe('5.0 GB');
    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(Number.NaN)).toBe('—');
  });

  it('formats rates and link speeds', () => {
    expect(formatRate(2 * 1024 * 1024)).toBe('2.0 MB/s');
    expect(formatBits(1_000_000_000)).toBe('1.0 Gbit/s');
    expect(formatBits(100_000_000)).toBe('100 Mbit/s');
    expect(formatBits(null)).toBe('—');
  });

  it('formats percentages, durations and clocks', () => {
    expect(formatPercent(42.4)).toBe('42%');
    expect(formatPercent(42.44, 1)).toBe('42.4%');
    expect(formatDuration(59)).toBe('59s');
    expect(formatDuration(3661)).toBe('1h 1m');
    expect(formatDuration(90061)).toBe('1d 1h 1m');
    expect(formatMhz(3400)).toBe('3.40 GHz');
    expect(formatMhz(0)).toBe('—');
  });

  it('formats sensors by unit', () => {
    expect(formatSensor(1.2456, 'V')).toBe('1.246 V');
    expect(formatSensor(1200, 'RPM')).toBe('1,200 RPM');
    expect(formatSensor(45.25, '°C')).toBe('45.3 °C');
  });
});
