/**
 * Overlay cards and the gift text actually appearing in the reveal DOM
 * (TESTING.md §6). The reveal is the one screen that must not regress
 * unnoticed, and this is the cheapest guard on it.
 */

import { describe, expect, it, vi } from 'vitest';

import { gift, dec, BUILD_LINES, DETAIL_ROWS } from '../../src/config/gift.js';
import { LEVEL_ORDER } from '../../src/core/input.js';
import { makeOverlay, LEVEL_FAIL, LEVEL_TITLE } from '../../src/shell/overlay.js';
import { makeViewport, toLogical } from '../../src/render/canvas.js';
import { W } from '../../src/config/tuning.js';

function mount() {
  const root = document.createElement('div');
  document.body.append(root);
  return { root, overlay: makeOverlay(root) };
}

describe('gift config', () => {
  it('decodes UTF-8, umlauts and all', () => {
    expect(dec('TEVWRUwgV8OESExFTg==')).toBe('LEVEL WÄHLEN');
    expect(gift('cardTitle')).toBe('SANDBOX VR');
    expect(gift('valueWhen')).toContain('Dienstag');
  });

  it('keeps the reveal out of plain sight in the bundle', async () => {
    // Spoiler containment (DEPLOY.md §7): the strings must not be greppable.
    const src = await import('node:fs').then((fs) => fs.readFileSync('src/config/gift.ts', 'utf8'));
    expect(src).not.toContain('SANDBOX');
    expect(src).not.toMatch(/Sandbox\s*VR/i);
  });
});

describe('overlay', () => {
  it('shows the title card', () => {
    const { root, overlay } = mount();
    overlay.showTitle({
      revealed: false,
      muted: false,
      resumeLevel: 'pfand',
      hasProgress: false,
      onStart: () => undefined,
      onToggleMute: () => undefined,
      onGift: () => undefined,
    });
    expect(root.textContent).toContain('JONAS BIRTHDAY BASH');
    // No gift button before the reveal has ever been seen.
    expect(root.textContent).not.toContain('ZUM GESCHENK');
  });

  it('shows the gift button once revealed', () => {
    const { root, overlay } = mount();
    overlay.showTitle({
      revealed: true,
      muted: true,
      resumeLevel: 'kayak',
      hasProgress: true,
      onStart: () => undefined,
      onToggleMute: () => undefined,
      onGift: () => undefined,
    });
    expect(root.textContent).toContain(gift('giftButton'));
    expect(root.textContent).toContain('TON IST AUS');
  });

  it('shows each level intro', () => {
    const { root, overlay } = mount();
    for (const level of LEVEL_ORDER) {
      overlay.showIntro(level, () => undefined);
      expect(root.textContent).toContain(LEVEL_TITLE[level]);
    }
  });

  it('offers the skip button only when the mercy rules allow it', () => {
    const { root, overlay } = mount();
    overlay.showFail({ level: 'sisyphos', canSkip: false, onRetry: () => undefined, onSkip: () => undefined });
    expect(root.textContent).toContain(LEVEL_FAIL.sisyphos);
    expect(root.textContent).not.toContain('ÜBERSPRINGEN');

    overlay.showFail({ level: 'sisyphos', canSkip: true, onRetry: () => undefined, onSkip: () => undefined });
    expect(root.textContent).toContain('ÜBERSPRINGEN');
  });

  it('renders every gift value into the reveal DOM', async () => {
    vi.useFakeTimers();
    const { root, overlay } = mount();
    const drop = vi.fn();
    overlay.showReveal({
      unlocked: 5,
      reducedMotion: true,
      totalFrames: 60 * 111,
      bestFrames: 60 * 97,
      isNewBest: false,
      onDrop: drop,
      onPlayAgain: () => undefined,
      onSelectLevel: () => undefined,
      afterhourUnlocked: false,
      onSelectAfterhour: () => undefined,
    });
    await vi.advanceTimersByTimeAsync(6000);
    vi.useRealTimers();

    const text = root.textContent ?? '';
    for (const key of BUILD_LINES) expect(text).toContain(gift(key));
    expect(text).toContain(gift('cardTitle'));
    expect(text).toContain(gift('cardCity'));
    expect(text).toContain('DEINE ZEIT');
    expect(text).toContain('1:51');
    expect(text).toContain('BESTZEIT: 1:37');
    expect(text).toContain(gift('cardTagline'));
    expect(text).toContain(gift('cardLinkLabel'));
    const link = root.querySelector('a.card-link') as HTMLAnchorElement | null;
    expect(link?.getAttribute('href')).toBe(gift('cardLinkHref'));
    for (const row of DETAIL_ROWS) {
      expect(text).toContain(gift(row.label));
      // Values may be multi-line; check the first line.
      expect(text).toContain(gift(row.value).split('\n')[0]);
    }
    expect(drop).toHaveBeenCalledTimes(1);
    expect(root.className).toContain('reveal');
  });

  it('announces a new best instead of the old one', async () => {
    vi.useFakeTimers();
    const { root, overlay } = mount();
    overlay.showReveal({
      unlocked: 5,
      reducedMotion: true,
      totalFrames: 60 * 90,
      bestFrames: 60 * 90,
      isNewBest: true,
      onDrop: () => undefined,
      onPlayAgain: () => undefined,
      onSelectLevel: () => undefined,
      afterhourUnlocked: false,
      onSelectAfterhour: () => undefined,
    });
    await vi.advanceTimersByTimeAsync(6000);
    vi.useRealTimers();
    expect(root.textContent).toContain('NEUE BESTZEIT');
  });

  it('has no high score section without a full, unskipped clear', async () => {
    vi.useFakeTimers();
    const { root, overlay } = mount();
    overlay.showReveal({
      unlocked: 5,
      reducedMotion: true,
      totalFrames: null,
      bestFrames: null,
      isNewBest: false,
      onDrop: () => undefined,
      onPlayAgain: () => undefined,
      onSelectLevel: () => undefined,
      afterhourUnlocked: false,
      onSelectAfterhour: () => undefined,
    });
    await vi.advanceTimersByTimeAsync(6000);
    vi.useRealTimers();
    expect(root.textContent).not.toContain('DEINE ZEIT');
  });

  it('shows the Afterhour tile, disabled until unlocked', async () => {
    vi.useFakeTimers();
    const { root, overlay } = mount();
    overlay.showReveal({
      unlocked: 5,
      reducedMotion: true,
      totalFrames: null,
      bestFrames: null,
      isNewBest: false,
      onDrop: () => undefined,
      onPlayAgain: () => undefined,
      onSelectLevel: () => undefined,
      afterhourUnlocked: false,
      onSelectAfterhour: () => undefined,
    });
    await vi.advanceTimersByTimeAsync(6000);
    vi.useRealTimers();
    const btn = root.querySelector('button.afterhour') as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn?.disabled).toBe(true);
  });

  it('enables the Afterhour tile once unlocked', async () => {
    vi.useFakeTimers();
    const { root, overlay } = mount();
    overlay.showReveal({
      unlocked: 5,
      reducedMotion: true,
      totalFrames: 60 * 111,
      bestFrames: null,
      isNewBest: true,
      onDrop: () => undefined,
      onPlayAgain: () => undefined,
      onSelectLevel: () => undefined,
      afterhourUnlocked: true,
      onSelectAfterhour: () => undefined,
    });
    await vi.advanceTimersByTimeAsync(6000);
    vi.useRealTimers();
    const btn = root.querySelector('button.afterhour') as HTMLButtonElement | null;
    expect(btn?.disabled).toBe(false);
  });

  it('shows the Afterhour intro and fail cards', () => {
    const { root, overlay } = mount();
    overlay.showAfterhourIntro({ bestLoops: 2, bestFrames: 600, onStart: () => undefined, onBack: () => undefined });
    expect(root.textContent).toContain('AFTERHOUR');

    overlay.showAfterhourFail({
      loops: 3,
      frames: 900,
      isNewBest: true,
      bestLoops: 3,
      onRetry: () => undefined,
      onTitle: () => undefined,
    });
    expect(root.textContent).toContain('NEUE BESTE RUNDE');
  });

  it('hides cleanly', () => {
    const { root, overlay } = mount();
    overlay.showIntro('katjes', () => undefined);
    expect(overlay.visible()).toBe(true);
    overlay.hide();
    expect(overlay.visible()).toBe(false);
    expect(root.textContent).toBe('');
  });
});

describe('pointer mapping', () => {
  it('maps client coordinates into the logical canvas', () => {
    const vp = makeViewport(390, 780, 2);
    expect(vp.w).toBe(W);
    const p = toLogical(vp, { left: 0, top: 0 }, 195, 390);
    expect(p.x).toBeCloseTo(195, 5);
    expect(p.y).toBeCloseTo(390, 5);
  });

  it('accounts for scaling and letterboxing', () => {
    const vp = makeViewport(780, 1560, 1); // twice the logical width
    const p = toLogical(vp, { left: 0, top: 0 }, 390, 200);
    expect(p.x).toBeCloseTo(195, 5);
    expect(p.y).toBeCloseTo((200 - vp.oy) / vp.scale, 5);
  });
});
