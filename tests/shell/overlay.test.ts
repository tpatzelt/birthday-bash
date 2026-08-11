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
    expect(gift('valueWhen')).toContain('15.08.2026');
  });

  it('keeps the reveal out of plain sight in the bundle', async () => {
    // Spoiler containment (DEPLOY.md §7): the strings must not be greppable.
    const src = await import('node:fs').then((fs) => fs.readFileSync('src/config/gift.ts', 'utf8'));
    expect(src).not.toContain('SANDBOX');
    expect(src).not.toMatch(/Sandbox\s*VR/i);
  });
});

describe('overlay', () => {
  it('shows the title card with the Kiel callback', () => {
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
    expect(root.textContent).toContain('BERLIN-QUEST');
    expect(root.textContent).toContain('Level 0: Kiel verlassen');
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
      onDrop: drop,
      onPlayAgain: () => undefined,
      onSelectLevel: () => undefined,
    });
    await vi.advanceTimersByTimeAsync(6000);
    vi.useRealTimers();

    const text = root.textContent ?? '';
    for (const key of BUILD_LINES) expect(text).toContain(gift(key));
    expect(text).toContain(gift('cardTitle'));
    expect(text).toContain(gift('cardCity'));
    expect(text).toContain(gift('cardTagline'));
    for (const row of DETAIL_ROWS) {
      expect(text).toContain(gift(row.label));
      // Values may be multi-line; check the first line.
      expect(text).toContain(gift(row.value).split('\n')[0]);
    }
    expect(drop).toHaveBeenCalledTimes(1);
    expect(root.className).toContain('reveal');
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
