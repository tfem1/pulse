import { describe, expect, it } from 'vitest';
import { en } from './en';
import { fr } from './fr';

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('translations', () => {
  it('French covers exactly the English keys', () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
  });

  it('keeps the same placeholders in every language', () => {
    for (const [k, v] of Object.entries(en)) {
      expect(vars(fr[k as keyof typeof en]), k).toEqual(vars(v));
    }
  });

  it('has no empty strings', () => {
    for (const d of [en, fr]) for (const [k, v] of Object.entries(d)) expect(v.trim(), k).not.toBe('');
  });
});
