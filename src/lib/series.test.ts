import { describe, expect, it } from 'vitest';
import { Ring, SeriesBank } from './series';

describe('Ring', () => {
  it('keeps the newest values in order', () => {
    const r = new Ring(3);
    [1, 2, 3, 4, 5].forEach((v) => r.push(v));
    expect(r.length).toBe(3);
    expect(r.tail(3)).toEqual([3, 4, 5]);
    expect(r.tail(2)).toEqual([4, 5]);
    expect(r.last()).toBe(5);
  });
});

describe('SeriesBank', () => {
  it('aligns series that start late and gaps missing keys', () => {
    const b = new SeriesBank(10);
    b.push(1000, { cpu: 10 });
    b.push(2000, { cpu: 20, gpu: 5 });
    b.push(3000, { gpu: 7 });
    const [x, cpu, gpu] = b.window(['cpu', 'gpu'], 60);
    expect(x).toEqual([1, 2, 3]);
    expect(cpu).toEqual([10, 20, null]);
    expect(gpu).toEqual([null, 5, 7]);
  });

  it('windows by time', () => {
    const b = new SeriesBank(100);
    for (let i = 0; i < 100; i++) b.push(i * 1000, { v: i });
    const [x] = b.window(['v'], 10);
    expect(x.length).toBe(10);
    expect(x[0]).toBe(90);
  });

  it('applies transforms and unknown keys yield gaps', () => {
    const b = new SeriesBank(5);
    b.push(0, { bytes: 2048 });
    const [, kb, nope] = b.window(['bytes', 'nope'], 5, (v) => v / 1024);
    expect(kb).toEqual([2]);
    expect(nope).toEqual([null]);
  });

  it('resizes keeping the newest samples', () => {
    const b = new SeriesBank(10);
    for (let i = 0; i < 10; i++) b.push(i * 1000, { v: i });
    const s = b.resized(4);
    expect(s.tail('v', 10)).toEqual([6, 7, 8, 9]);
    expect(s.latest('v')).toBe(9);
  });
});

describe('SeriesBank memory hygiene', () => {
  it('drops a series that has been absent for a whole buffer', () => {
    const b = new SeriesBank(3);
    b.push(0, { eth0: 1, tun0: 5 });
    b.push(1000, { eth0: 2 });
    b.push(2000, { eth0: 3 });
    expect(b.has('tun0')).toBe(true); // still has a value in the window
    b.push(3000, { eth0: 4 });
    expect(b.has('tun0')).toBe(false);
    expect(b.keys()).toEqual(['eth0']);
  });

  it('keeps a series that comes back before expiring', () => {
    const b = new SeriesBank(3);
    b.push(0, { sda: 1 });
    b.push(1000, {});
    b.push(2000, { sda: 2 });
    b.push(3000, {});
    b.push(4000, {});
    expect(b.has('sda')).toBe(true);
    expect(b.tail('sda', 3).map((v) => (Number.isNaN(v) ? null : v))).toEqual([2, null, null]);
  });

  it('stores values with enough precision for charts', () => {
    const b = new SeriesBank(2);
    const bytes = 12_345_678_901; // 11.5 GiB
    b.push(1_700_000_000_123, { mem: bytes, cpu: 42.42 });
    expect(Math.abs(b.latest('mem')! - bytes) / bytes).toBeLessThan(1e-6);
    expect(b.latest('cpu')!).toBeCloseTo(42.42, 4);
    expect(b.lastTime()).toBe(1_700_000_000_123); // timestamps stay exact
  });
});
