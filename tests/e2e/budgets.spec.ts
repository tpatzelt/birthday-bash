/**
 * Budgets (TESTING.md §9), enforced against the shipped image.
 *
 * This is the test that catches "the game got slow" before the phone does.
 */

import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { readdirSync } from 'node:fs';

test.describe('bundle size', () => {
  test('JS is under 150 KB gzipped and the whole app under 300 KB', () => {
    const dir = 'dist/assets';
    let js = 0;
    let total = 0;
    for (const f of readdirSync(dir)) {
      const gz = gzipSync(readFileSync(`${dir}/${f}`)).length;
      total += gz;
      if (f.endsWith('.js')) js += gz;
    }
    for (const f of ['index.html', 'sw.js', 'manifest.webmanifest', 'icon.svg']) {
      total += gzipSync(readFileSync(`dist/${f}`)).length;
    }
    expect(js, 'JS gzipped').toBeLessThanOrEqual(150 * 1024);
    expect(total, 'total transfer gzipped').toBeLessThanOrEqual(300 * 1024);
  });
});

test.describe('frame time', () => {
  test('per-frame CPU work stays under 20 ms at 4× CPU throttle', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'CPU throttling is a CDP feature');
    // Every sampled frame is also rasterised in software, which is what makes
    // this slow to run even though the thing being measured is fast.
    test.setTimeout(240_000);

    // Measured as the cost of one fixed step plus one full draw, not as the
    // interval between rAF callbacks. Headless Chromium rasterises the canvas
    // in software (no GPU), which alone costs >100 ms per frame on a
    // 1082×2202 backing store — a number that says everything about the test
    // runner and nothing about the phone. What this repo controls, and what
    // "the game got slow" would actually show up in, is the JS work per frame.
    await page.goto('/');
    await page.waitForFunction(() => typeof window.__bb?.getState === 'function');

    const client = await page.context().newCDPSession(page);
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    const worst = { level: '', p95: 0 };
    for (const level of ['pfand', 'sisyphos', 'katjes', 'kayak'] as const) {
      const p95 = await page.evaluate(async (lvl) => {
        window.__bb.freeze();
        window.__bb.goto(lvl, 3);
        const samples: number[] = [];
        for (let i = 0; i < 100; i++) {
          const t0 = performance.now();
          window.__bb.step(1);
          samples.push(performance.now() - t0);
          if (i % 20 === 0) await new Promise((r) => setTimeout(r, 0));
        }
        window.__bb.unfreeze();
        const a = samples.slice(5).sort((x, y) => x - y);
        return a[Math.floor(a.length * 0.95)] ?? 0;
      }, level);
      if (p95 > worst.p95) {
        worst.p95 = p95;
        worst.level = level;
      }
    }

    await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    expect(worst.p95, `worst level ${worst.level}: ${worst.p95.toFixed(2)} ms/frame`).toBeLessThanOrEqual(20);
  });

  test('heap does not grow across repeated playthroughs', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'heap stats are a CDP feature');
    await page.goto('/');
    await page.waitForFunction(() => typeof window.__bb?.getState === 'function');

    const heap = async (): Promise<number> => {
      const client = await page.context().newCDPSession(page);
      await client.send('HeapProfiler.collectGarbage');
      const { result } = await client.send('Runtime.evaluate', {
        expression: 'performance.memory?.usedJSHeapSize ?? 0',
      });
      return Number(result.value ?? 0);
    };

    const playAll = async () => {
      await page.evaluate(() => {
        window.__bb.freeze();
        for (const level of ['pfand', 'sisyphos', 'katjes', 'kayak']) {
          window.__bb.goto(level, 5);
          window.__bb.step(3600);
        }
        window.__bb.unfreeze();
      });
    };

    await playAll();
    const after1 = await heap();
    await playAll();
    await playAll();
    const after3 = await heap();
    if (after1 > 0) expect(after3).toBeLessThan(after1 * 1.5);
  });
});
