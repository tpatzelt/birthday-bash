import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { cloneRng, makeRng, rand, randInt, randRange, randWeighted } from '../../src/core/rng.js';

describe('rng', () => {
  it('is a pure function of the seed', () => {
    const a = makeRng(1234);
    const b = makeRng(1234);
    for (let i = 0; i < 1000; i++) expect(rand(a)).toBe(rand(b));
  });

  it('produces the same first 1000 draws from two different entry points', () => {
    // Guard test from TESTING.md §2: seeding from anywhere must agree.
    const direct = makeRng(7);
    const viaClone = cloneRng(makeRng(7));
    const a: number[] = [];
    const b: number[] = [];
    for (let i = 0; i < 1000; i++) {
      a.push(rand(direct));
      b.push(rand(viaClone));
    }
    expect(a).toEqual(b);
  });

  it('decorrelates adjacent seeds', () => {
    const first = [];
    for (let seed = 0; seed < 32; seed++) first.push(rand(makeRng(seed)));
    const sorted = [...first].sort((x, y) => x - y);
    // If adjacent seeds were correlated, the raw order would already be sorted.
    expect(first).not.toEqual(sorted);
  });

  it('stays in range', () => {
    const r = makeRng(99);
    for (let i = 0; i < 5000; i++) {
      const u = rand(r);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
      const v = randRange(r, -5, 5);
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThan(5);
      const n = randInt(r, 1, 3);
      expect([1, 2, 3]).toContain(n);
    }
  });

  it('respects weights', () => {
    const r = makeRng(5);
    const counts = [0, 0, 0];
    for (let i = 0; i < 30000; i++) counts[randWeighted(r, [0.55, 0.3, 0.15])]++;
    expect(counts[0] / 30000).toBeCloseTo(0.55, 1);
    expect(counts[1] / 30000).toBeCloseTo(0.3, 1);
    expect(counts[2] / 30000).toBeCloseTo(0.15, 1);
  });

  it('never reaches for Math.random under core/', () => {
    // Belt and braces alongside the ESLint rule: the one global that silently
    // destroys determinism.
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      );
    const offenders = walk('src/core')
      .filter((f) => f.endsWith('.ts'))
      .filter((f) => {
        // Comments are allowed to *name* the forbidden globals — several of
        // them exist to explain why they are forbidden.
        const src = readFileSync(f, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/.*$/gm, '');
        return /Math\.random|Date\.now|performance\.now|\bwindow\b|\bdocument\b/.test(src);
      });
    expect(offenders).toEqual([]);
  });
});
