/**
 * Visual regression (TESTING.md §8).
 *
 * Made possible by determinism: setSeed → freeze → step(n) → screenshot. Fixed
 * seed and fixed frame count means pixel-stable output.
 *
 * Pixel comparison only survives if the browser and its font rasterisation are
 * identical everywhere, so this suite never runs on the host directly: drive it
 * through `npm run visual`, which puts the browsers in the pinned Playwright
 * container (scripts/visual.sh). The committed baselines are that container's
 * output, which is why the same PNGs are valid locally and in CI.
 *
 *   npm run visual           # check
 *   npm run visual:update    # regenerate after an intentional visual change
 *
 * VISUAL=1 gates the suite so a plain `npm run e2e` on a workstation, where the
 * fonts are wrong, can't fail on it. Still first on the cut list in PLAN.md §4:
 * if it is ever in the way, delete this file and keep the playthrough test.
 */

import { expect, test } from '@playwright/test';

test.skip(!process.env.VISUAL, 'set VISUAL=1 (baselines are generated in the CI image)');

const LEVELS = ['pfand', 'sisyphos', 'katjes', 'kayak'] as const;

/**
 * How far to step for the "busy" frame — per level, because these screenshots
 * are taken with **no input at all**, and a level nobody is playing eventually
 * loses. Pfand is out after 188 frames (three missed bottles) and Sisyphos
 * after 784 on the shorter iPhone viewport, so the old flat 900 quietly
 * photographed a fail card for those two instead of a busy playfield.
 *
 * Each value sits under its level's idle-death frame with margin. Raising one
 * past that point turns the baseline back into a fail card, which is what the
 * `phase === 'play'` assertion below is there to catch.
 */
const BUSY_FRAMES: Record<(typeof LEVELS)[number], number> = {
  pfand: 150,
  sisyphos: 600,
  katjes: 900,
  kayak: 900,
};

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
    await frozenAt(page, level, BUSY_FRAMES[level]);
    // A busy playfield, not a fail card — see BUSY_FRAMES.
    expect(await page.evaluate(() => window.__bb.getState().phase)).toBe('play');
    await expect(page).toHaveScreenshot(`${level}-busy.png`);
  });
}

test('fail card, without and with the skip button', async ({ page }) => {
  // Pfand on purpose: "Dreimal danebengetreten. Der Bon bleibt leer." is the
  // longest fail headline in the game and the only one that has to wrap on a
  // phone. It used to run straight off the right edge on both viewports, so
  // this is the card worth watching. Left alone it fails on its own at frame
  // 188 — three missed bottles, no input needed.
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__bb?.getState === 'function');
  const fail = async () => {
    await page.evaluate(() => {
      window.__bb.freeze();
      window.__bb.goto('pfand', 4);
      window.__bb.step(240);
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
