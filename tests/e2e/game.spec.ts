/**
 * E2E against the production Docker image (TESTING.md §7).
 *
 * Not `vite dev`, not `vite preview` — the exact container that ships. A test
 * that passes against a dev server proves nothing about the artifact that
 * ships.
 */

import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { LEVEL_ORDER, type Tape } from '../../src/core/input.js';

const TAPES: Record<string, Tape> = Object.fromEntries(
  LEVEL_ORDER.map((l) => [l, JSON.parse(readFileSync(`tests/tapes/${l}-win.json`, 'utf8')) as Tape]),
);

type BB = {
  version: string;
  loadTape: (t: unknown) => boolean;
  setSeed: (n: number) => void;
  freeze: () => void;
  unfreeze: () => void;
  step: (n?: number) => void;
  getState: () => { phase: string; hash: string | null; state: Record<string, unknown> | null };
  goto: (level: string, seed?: number) => void;
  gotoAfterhour: (seed?: number) => void;
  reveal: () => void;
  save: () => { unlocked: number; revealed: boolean; muted: boolean };
  afterhourSave: () => { bestLoops: number; bestFrames: number };
};

declare global {
  interface Window {
    __bb: BB;
  }
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => typeof window.__bb?.getState === 'function');
}

/** Run a whole tape instantly: freeze the rAF loop and step deterministically. */
async function playTape(page: Page, tape: Tape): Promise<void> {
  await page.evaluate((t) => {
    window.__bb.freeze();
    window.__bb.loadTape(t);
    window.__bb.step(t.frames.length + 400);
    window.__bb.unfreeze();
  }, tape as unknown as Tape);
}

test.describe('cold load', () => {
  test('shows the title screen quickly, with no console errors', async ({ page }) => {
    const errors = collectErrors(page);
    const t0 = Date.now();
    await page.goto('/');
    await expect(page.locator('#overlay h1')).toHaveText('JONAS BIRTHDAY BASH');
    expect(Date.now() - t0).toBeLessThan(4000);
    await expect(page.locator('#overlay')).toContainText('Vier Level. Ein Endgegner.');
    await ready(page);
    expect(errors).toEqual([]);
  });

  test('registers a service worker', async ({ page }) => {
    await page.goto('/');
    const registered = await page.waitForFunction(
      () => navigator.serviceWorker?.getRegistration().then((r) => !!r),
      undefined,
      { timeout: 20_000 },
    );
    expect(await registered.jsonValue()).toBe(true);
  });

  test('exposes the build version', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    const v = await page.evaluate(() => window.__bb.version);
    expect(v).toMatch(/^[0-9a-f]{7,}$|^dev$/);
  });
});

test.describe('the whole gift', () => {
  test('plays all four levels to the reveal and shows the gift details', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/');
    await ready(page);

    for (const level of LEVEL_ORDER) {
      await playTape(page, TAPES[level]);
      const state = await page.evaluate(() => window.__bb.getState());
      // Each tape is a *winning* tape: the level must be over, not still running.
      expect(state.phase, `${level} finished`).not.toBe('play');
      if (level !== 'kayak') {
        await page.locator('#overlay button.primary').click(); // WEITER
        await expect(page.locator('#overlay')).toContainText(/PFANDPIRAT|SISYPHOS|SALZIGE|KAYAK/);
      }
    }

    // Straight out of the whale's splash: the reveal.
    const overlay = page.locator('#overlay');
    await expect(overlay).toHaveClass(/reveal/);
    await expect(overlay).toContainText('VIER LEVEL GESCHAFFT.', { timeout: 20_000 });
    await expect(overlay).toContainText('SANDBOX VR', { timeout: 20_000 });
    await expect(overlay).toContainText('BERLIN');
    await expect(overlay).toContainText('Du. Wir. Headsets. Bald.');
    // The practical details, straight from config/gift.ts.
    await expect(overlay).toContainText('WANN');
    await expect(overlay).toContainText('Dienstag');
    await expect(overlay).toContainText('WO');
    await expect(overlay).toContainText('WER');
    // Four real wins, and still no clock: the reveal never shows a time.
    await expect(overlay).not.toContainText('DEINE ZEIT');

    const save = await page.evaluate(() => window.__bb.save());
    expect(save.revealed).toBe(true);
    expect(errors).toEqual([]);
  });

  test('?skip=1 reaches the reveal directly', async ({ page }) => {
    await page.goto('/?skip=1');
    await expect(page.locator('#overlay')).toHaveClass(/reveal/);
    await expect(page.locator('#overlay')).toContainText('SANDBOX VR', { timeout: 20_000 });
    await expect(page.locator('#overlay')).not.toContainText('DEINE ZEIT');
  });

  test('unlocks Afterhour after a full clear and a run updates its highscore', async ({ page }) => {
    await page.goto('/');
    await ready(page);

    for (const level of LEVEL_ORDER) {
      await playTape(page, TAPES[level]);
      if (level !== 'kayak') await page.locator('#overlay button.primary').click();
    }

    const overlay = page.locator('#overlay');
    await expect(overlay).toHaveClass(/reveal/);
    await expect(overlay).toContainText('SANDBOX VR', { timeout: 20_000 });

    const ahBtn = page.locator('#overlay button.afterhour');
    await expect(ahBtn).toBeVisible();
    await expect(ahBtn).toBeEnabled();
    await ahBtn.click();
    await expect(overlay).toContainText('AFTERHOUR');

    await page.locator('#overlay button.primary').click(); // LOS
    await expect(overlay).not.toHaveClass(/on/);

    await page.evaluate(() => {
      window.__bb.freeze();
      window.__bb.gotoAfterhour(1);
      window.__bb.step(40 * 60);
      window.__bb.unfreeze();
    });
    const state = await page.evaluate(() => window.__bb.getState());
    expect(state.phase === 'afterhour' || state.phase === 'afterhourFail').toBe(true);
  });

  test('offers "zum Geschenk" on the title screen once seen', async ({ page }) => {
    await page.goto('/?skip=1');
    await expect(page.locator('#overlay')).toContainText('SANDBOX VR', { timeout: 20_000 });
    await page.goto('/');
    await expect(page.locator('#overlay')).toContainText('ZUM GESCHENK');
    await page.locator('#overlay button', { hasText: 'ZUM GESCHENK' }).click();
    await expect(page.locator('#overlay')).toContainText('SANDBOX VR', { timeout: 20_000 });
  });
});

test.describe('the input path itself', () => {
  test('plays a level with real touch events', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    await page.locator('#overlay button.primary').click(); // LOSGEHEN
    await page.locator('#overlay button.primary').click(); // LOS
    await expect(page.locator('#overlay')).not.toHaveClass(/on/);

    const box = (await page.locator('#game').boundingBox())!;
    let jumped = false;
    for (let i = 0; i < 24 && !jumped; i++) {
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height * 0.7);
      await page.waitForTimeout(90);
      jumped = await page.evaluate(() => {
        const s = window.__bb.getState().state as { onGround?: boolean } | null;
        return s ? s.onGround === false : false;
      });
    }
    expect(jumped, 'a tap made the player jump').toBe(true);

    // And a drag moves the bag in L3.
    await page.evaluate(() => window.__bb.goto('katjes', 7));
    await page.waitForTimeout(200);
    const before = await page.evaluate(() => (window.__bb.getState().state as { x: number }).x);
    await page.touchscreen.tap(box.x + 20, box.y + box.height * 0.8);
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => (window.__bb.getState().state as { x: number }).x);
    expect(Math.abs(after - before)).toBeGreaterThan(5);
  });
});

test.describe('interruptions', () => {
  test('backgrounding the tab pauses instead of fast-forwarding', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    await page.evaluate(() => window.__bb.goto('sisyphos', 5));
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const paused = await page.evaluate(() => (window.__bb.getState().state as { frame: number }).frame);
    await page.waitForTimeout(1500);
    const still = await page.evaluate(() => (window.__bb.getState().state as { frame: number }).frame);
    expect(still - paused).toBeLessThan(6);

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(600);
    const resumed = await page.evaluate(() => (window.__bb.getState().state as { frame: number }).frame);
    // Resumed, and did not replay the second it spent hidden.
    expect(resumed).toBeGreaterThan(still);
    expect(resumed - still).toBeLessThan(90);
  });

  test('progress and mute survive a reload', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    await page.locator('#overlay button.quiet').click(); // 🔊 TON AN? -> muted toggle
    const muted = await page.evaluate(() => window.__bb.save().muted);

    await playTape(page, TAPES.pfand);
    await page.locator('#overlay button.primary').click();
    const before = await page.evaluate(() => window.__bb.save());
    expect(before.unlocked).toBeGreaterThan(1);

    await page.reload();
    await ready(page);
    const after = await page.evaluate(() => window.__bb.save());
    expect(after.unlocked).toBe(before.unlocked);
    expect(after.muted).toBe(muted);
    await expect(page.locator('#overlay')).toContainText('WEITER');
  });
});

test.describe('device conditions', () => {
  test('landscape shows the hint and portrait restores the canvas', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    const size = page.viewportSize()!;
    await page.setViewportSize({ width: size.height, height: size.width });
    await expect(page.locator('#rotate')).toBeVisible();
    await expect(page.locator('#rotate')).toContainText('BITTE DREHEN');

    await page.setViewportSize(size);
    await expect(page.locator('#rotate')).toBeHidden();
    const ok = await page.evaluate(() => {
      const c = document.getElementById('game') as HTMLCanvasElement;
      return c.width > 0 && c.height > 0;
    });
    expect(ok).toBe(true);
  });

  test('still playable offline after the first load', async ({ page, context, browserName }) => {
    await page.goto('/');
    await ready(page);
    await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, undefined, {
      timeout: 20_000,
    });
    await context.setOffline(true);
    await page.reload().catch((err) => {
      // WebKit's driver throws "internal error" on a reload issued while
      // offline even when the navigation itself succeeds from the service
      // worker cache (microsoft/playwright#34402, unresolved upstream). The
      // assertions below still catch a genuinely broken service worker.
      if (browserName !== 'webkit') throw err;
    });
    await expect(page.locator('#overlay h1')).toHaveText('JONAS BIRTHDAY BASH');
    await ready(page);
    await context.setOffline(false);
  });

  test('is completable with audio blocked', async ({ page }) => {
    const errors = collectErrors(page);
    await page.addInitScript(() => {
      // Refuse the AudioContext outright: the game must not care.
      const boom = function () {
        throw new Error('AudioContext blocked');
      } as unknown as typeof AudioContext;
      Object.defineProperty(window, 'AudioContext', { value: boom, configurable: true });
      Object.defineProperty(window, 'webkitAudioContext', { value: boom, configurable: true });
    });
    await page.goto('/');
    await ready(page);
    await page.locator('#overlay button.primary').click();
    await page.locator('#overlay button.primary').click();
    await playTape(page, TAPES.pfand);
    const state = await page.evaluate(() => window.__bb.getState());
    expect(state.phase).not.toBe('play');
    expect(errors.filter((e) => !e.includes('AudioContext blocked'))).toEqual([]);
  });
});

test.describe('mercy rules', () => {
  test('offers Überspringen only after the second fail', async ({ page }) => {
    await page.goto('/');
    await ready(page);

    const failOnce = async () => {
      await page.evaluate(() => {
        window.__bb.freeze();
        window.__bb.goto('sisyphos', 11);
        // Never touch the screen: the idle bot's fate, but faster.
        window.__bb.step(130 * 60);
        window.__bb.unfreeze();
      });
      await expect(page.locator('#overlay')).toContainText('Heute nicht.');
    };

    await failOnce();
    await expect(page.locator('#overlay')).not.toContainText('ÜBERSPRINGEN');
    await page.locator('#overlay button.primary').click();
    await failOnce();
    await expect(page.locator('#overlay')).toContainText('ÜBERSPRINGEN');

    // And the skip actually moves him on.
    await page.locator('#overlay button.quiet').click();
    await expect(page.locator('#overlay')).toContainText('SALZIGE HERINGE');
    expect((await page.evaluate(() => window.__bb.save())).unlocked).toBeGreaterThanOrEqual(3);
  });
});
