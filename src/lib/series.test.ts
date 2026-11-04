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
