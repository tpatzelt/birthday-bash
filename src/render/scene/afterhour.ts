/**
 * Afterhour meta-strip: drawn on top of the segment's own, completely
 * unmodified renderLevel() output — loop counter, shared strike pips, and a
 * brief non-blocking "RUNDE n" label on a segment/loop transition.
 */

import { W } from '../../config/tuning.js';
import type { AfterhourState } from '../../core/afterhour.js';
import { forEachAfterhourEvent } from '../../core/afterhour.js';
import { AMBER, CHALK, PINK } from '../palette.js';
import { display, livesRow, numerals, tracked } from '../hud.js';

type Label = { active: boolean; text: string; life: number };
const label: Label = { active: false, text: '', life: 0 };

export function drawAfterhourMeta(ctx: CanvasRenderingContext2D, s: AfterhourState, top: number, frame: number): void {
  forEachAfterhourEvent(s, (e) => {
    if (e.type === 'loopComplete') {
      label.active = true;
      label.text = `RUNDE ${s.loop + 1}`;
      label.life = 42;
    }
  });

  ctx.fillStyle = CHALK;
  display(ctx, 9, 800);
  ctx.textAlign = 'right';
  tracked(ctx, 'AFTERHOUR', W - 20, top + 8, 2.6, 'right');
  ctx.textAlign = 'left';

  numerals(ctx, 11);
  ctx.fillStyle = AMBER;
  ctx.textAlign = 'right';
  ctx.fillText(`RUNDE ${s.loop + 1}`, W - 20, top + 24);
  ctx.textAlign = 'left';

  livesRow(ctx, W - 20 - (s.strikesMax - 1) * 13 - 8, top + 30, s.strikes, s.strikesMax);

  if (label.active) {
    label.life--;
    if (label.life <= 0) {
      label.active = false;
    } else {
      const t = label.life / 42;
      ctx.globalAlpha = t < 0.5 ? t * 2 : (1 - t) * 2;
      ctx.fillStyle = PINK;
      display(ctx, 22, 800);
      ctx.textAlign = 'center';
      tracked(ctx, label.text, W / 2, s.segment.h * 0.4, 3, 'center');
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }
  }
  void frame;
}
