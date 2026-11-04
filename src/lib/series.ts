/**
 * Allocation-free rolling time series for the charts.
 *
 * Every series in a bank shares the bank's time axis, so any subset can be
 * handed to uPlot as `AlignedData`. Missing values are stored as NaN and
 * emitted as `null` (a gap in the line).
 */

export class Ring {
  private buf: Float64Array;
  private head = 0;
  private count = 0;

  constructor(readonly capacity: number) {
    this.buf = new Float64Array(Math.max(1, capacity));
  }

  push(v: number): void {
    this.buf[this.head] = v;
    this.head = (this.head + 1) % this.buf.length;
    if (this.count < this.buf.length) this.count++;
  }

  get length(): number {
    return this.count;
  }

  /** Value at logical index i (0 = oldest). */
  at(i: number): number {
    const start = (this.head - this.count + this.buf.length) % this.buf.length;
    return this.buf[(start + i) % this.buf.length];
  }

  last(): number {
    return this.count ? this.at(this.count - 1) : Number.NaN;
  }

  /** Copy of the newest `n` values (oldest first). */
  tail(n: number): number[] {
    const k = Math.min(n, this.count);
    const out = new Array<number>(k);
    for (let i = 0; i < k; i++) out[i] = this.at(this.count - k + i);
    return out;
  }
}

export type SeriesValues = Record<string, number | null | undefined>;
export type AlignedData = [number[], ...(number | null)[][]];

export class SeriesBank {
  private time: Ring;
  private series = new Map<string, Ring>();

  constructor(readonly capacity: number) {
    this.time = new Ring(capacity);
  }

  get length(): number {
    return this.time.length;
  }

  keys(): string[] {
    return [...this.series.keys()];
  }

  has(key: string): boolean {
    return this.series.has(key);
  }

  lastTime(): number {
    return this.time.last();
  }

  /** Append one sample. Keys absent from `values` get a gap. */
  push(timestampMs: number, values: SeriesValues): void {
    this.time.push(timestampMs);
    for (const [key, v] of Object.entries(values)) {
      let ring = this.series.get(key);
      if (!ring) {
        ring = new Ring(this.capacity);
        // Pad so the new series stays aligned with the time axis.
        for (let i = 0; i < this.time.length - 1; i++) ring.push(Number.NaN);
        this.series.set(key, ring);
      }
      ring.push(v == null || !Number.isFinite(v) ? Number.NaN : v);
    }
    for (const [key, ring] of this.series) {
      if (!(key in values)) ring.push(Number.NaN);
    }
  }

  latest(key: string): number | null {
    const v = this.series.get(key)?.last();
    return v == null || Number.isNaN(v) ? null : v;
  }

  /** Raw tail of one series (NaN for gaps), e.g. for sparklines. */
  tail(key: string, n: number): number[] {
    return this.series.get(key)?.tail(n) ?? [];
  }

  /** Number of samples covering the last `seconds`. */
  private windowCount(seconds: number): number {
    const n = this.time.length;
    if (n === 0) return 0;
    const cutoff = this.time.last() - seconds * 1000;
    let lo = 0;
    let hi = n - 1;
    // Binary search for the first timestamp > cutoff (times are monotonic).
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.time.at(mid) > cutoff) hi = mid;
      else lo = mid + 1;
    }
    return n - lo;
  }

  /** uPlot data for `keys` over the last `seconds` (x axis in seconds). */
  window(keys: string[], seconds: number, transform?: (v: number) => number): AlignedData {
    const n = this.windowCount(seconds);
    const xs = this.time.tail(n).map((t) => t / 1000);
    const ys = keys.map((k) => {
      const ring = this.series.get(k);
      if (!ring) return new Array<number | null>(n).fill(null);
      return ring.tail(n).map((v) => (Number.isNaN(v) ? null : transform ? transform(v) : v));
    });
    return [xs, ...ys];
  }

  /** Copy into a bank with a different capacity, keeping the newest samples. */
  resized(capacity: number): SeriesBank {
    const next = new SeriesBank(capacity);
    const n = Math.min(this.time.length, capacity);
    const keys = this.keys();
    const tails = keys.map((k) => this.series.get(k)!.tail(n));
    const times = this.time.tail(n);
    for (let i = 0; i < n; i++) {
      const values: SeriesValues = {};
      keys.forEach((k, j) => (values[k] = tails[j][i]));
      next.push(times[i], values);
    }
    return next;
  }
}
