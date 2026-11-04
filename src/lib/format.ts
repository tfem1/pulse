/** Locale-aware formatting helpers. Binary units (KiB = 1024) throughout. */

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

let locale = 'en';
export function setFormatLocale(l: string): void {
  locale = l;
}

function num(v: number, digits: number): string {
  return v.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatBytes(bytes: number | null | undefined, digits = 1): string {
  if (bytes == null || !Number.isFinite(bytes)) return '—';
  let v = Math.max(0, bytes);
  let i = 0;
  while (v >= 1024 && i < BYTE_UNITS.length - 1) {
    v /= 1024;
    i++;
  }
  return `${num(v, i === 0 ? 0 : digits)} ${BYTE_UNITS[i]}`;
}

export function formatRate(bps: number | null | undefined, digits = 1): string {
  if (bps == null || !Number.isFinite(bps)) return '—';
  return `${formatBytes(bps, digits)}/s`;
}

/** Network link speeds are conventionally decimal bits per second. */
export function formatBits(bitsPerSec: number | null | undefined): string {
  if (bitsPerSec == null || !Number.isFinite(bitsPerSec) || bitsPerSec <= 0) return '—';
  const units = ['bit/s', 'Kbit/s', 'Mbit/s', 'Gbit/s', 'Tbit/s'];
  let v = bitsPerSec;
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  return `${num(v, v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatPercent(v: number | null | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${num(v, digits)}%`;
}

export function formatNumber(v: number | null | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return num(v, digits);
}

export function formatDuration(totalSecs: number | null | undefined): string {
  if (totalSecs == null || !Number.isFinite(totalSecs)) return '—';
  const s = Math.max(0, Math.floor(totalSecs));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function formatMhz(mhz: number | null | undefined): string {
  if (mhz == null || !Number.isFinite(mhz) || mhz <= 0) return '—';
  return mhz >= 1000 ? `${num(mhz / 1000, 2)} GHz` : `${num(mhz, 0)} MHz`;
}

export function formatTemp(c: number | null | undefined): string {
  if (c == null || !Number.isFinite(c)) return '—';
  return `${num(c, 0)} °C`;
}

export function formatSensor(value: number, unit: string): string {
  switch (unit) {
    case 'V':
      return `${num(value, 3)} V`;
    case 'A':
      return `${num(value, 2)} A`;
    case 'W':
      return `${num(value, 1)} W`;
    case 'RPM':
      return `${num(value, 0)} RPM`;
    case '°C':
      return `${num(value, 1)} °C`;
    default:
      return `${num(value, 1)} ${unit}`.trim();
  }
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
