/**
 * Visual regression (TESTING.md §8).
 *
 * Made possible by determinism: setSeed → freeze → step(n) → screenshot. Fixed
 * seed and fixed frame count means pixel-stable output.
 *
 * Baselines must be generated in the CI container image so local/CI font
 * differences don't cause permanent false failures — so this suite only runs
 * with VISUAL=1, and CI updates the baselines in its own image. It is also
 * first on the cut list in PLAN.md §4: if it is ever in the way, delete this
 * file and keep the playthrough test.
 */

import { expect, test } from '@playwright/test';

test.skip(!process.env.VISUAL, 'set VISUAL=1 (baselines are generated in the CI image)');

const LEVELS = ['pfand', 'sisyphos', 'katjes', 'kayak'] as const;

async function frozenAt(page: import('@playwright/test').Page, level: string, frames: number) {
  await page.evaluate(
    ([l, n]) => {
      window.__bb.freeze();
      window.__bb.goto(l as string, 4);
      window.__bb.step(n as number);
    },
    [level, frames],
  );
}

test('title screen', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__bb?.getState === 'function');
  await page.evaluate(() => window.__bb.freeze());
  await expect(page).toHaveScreenshot('title.png');
});

for (const level of LEVELS) {
  test(`${level} — early frame`, async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window.__bb?.getState === 'function');
    await frozenAt(page, level, 30);
    await expect(page).toHaveScreenshot(`${level}-early.png`);
  });

  test(`${level} — busy frame`, async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window.__bb?.getState === 'function');
    await frozenAt(page, level, 900);
    await expect(page).toHaveScreenshot(`${level}-busy.png`);
  });
}

test('fail card, without and with the skip button', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__bb?.getState === 'function');
  const fail = async () => {
    await page.evaluate(() => {
      window.__bb.freeze();
      window.__bb.goto('sisyphos', 11);
      window.__bb.step(130 * 60);
    });
  };
  await fail();
  await expect(page).toHaveScreenshot('fail-no-skip.png');
  await page.locator('#overlay button.primary').click();
  await fail();
  await expect(page).toHaveScreenshot('fail-with-skip.png');
});

test('the reveal', async ({ page }) => {
  // The one screen that absolutely must not regress unnoticed.
  await page.goto('/?skip=1');
  await expect(page.locator('#overlay')).toContainText('SANDBOX VR', { timeout: 20_000 });
  await page.evaluate(() => window.__bb.freeze());
  await page.waitForTimeout(500);
  await expect(page).toHaveScreenshot('reveal.png', { maxDiffPixelRatio: 0.01 });
});
