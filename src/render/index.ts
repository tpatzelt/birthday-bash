/**
 * The renderer root: reads state, draws, never writes state.
 *
 * Screen shake lives here rather than in the sim — it is a property of the
 * camera, not of the world, and `prefers-reduced-motion` must be able to
 * suppress it without changing a single simulated value.
 */

import { TUNING, W } from '../config/tuning.js';
import type { AnyLevelState } from '../core/game.js';
import type { AfterhourState } from '../core/afterhour.js';
import type { Viewport } from './canvas.js';
import { drawHud } from './hud.js';
import { INK } from './palette.js';
import { consumeEvents, drawParticles, updateParticles, type Particles } from './particles.js';
import { drawKatjes } from './scene/katjes.js';
import { drawKayak } from './scene/kayak.js';
import { drawPfand } from './scene/pfand.js';
import { drawSisyphos } from './scene/sisyphos.js';
import { drawAfterhourMeta } from './scene/afterhour.js';

export type RenderContext = {
  ctx: CanvasRenderingContext2D;
  vp: Viewport;
  particles: Particles;
  reducedMotion: boolean;
  /** 0..1 within the current beat, for the fairy lights. */
  beatPhase: number;
  /** Fades the whole frame to white — the whale's splash into the reveal. */
  whiteout: number;
  /** Dev harness: draw hitboxes and the channel over the scene. */
  debug?: boolean;
};

export function clear(ctx: CanvasRenderingContext2D, vp: Viewport): void {
  // Clear the whole device surface, including the letterbox, in device space.
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
  void vp;
}

export function renderLevel(rc: RenderContext, s: AnyLevelState, frame: number): void {
  const { ctx, vp } = rc;
  clear(ctx, vp);

  consumeEvents(rc.particles, s);
  updateParticles(rc.particles);

  const shake = rc.reducedMotion ? 0 : s.shake;
  ctx.save();
  if (shake > 0) {
    // A deterministic wobble: no RNG in the render path either, so a frozen
    // frame in a visual test is pixel-stable.
    ctx.translate(Math.sin(frame * 1.7) * shake, Math.cos(frame * 2.3) * shake * 0.6);
  }

  switch (s.level) {
    case 'pfand':
      drawPfand(ctx, s, frame);
      break;
    case 'sisyphos':
      drawSisyphos(ctx, s, frame, rc.beatPhase);
      break;
    case 'katjes':
      drawKatjes(ctx, s, frame);
      break;
    case 'kayak':
      drawKayak(ctx, s, frame);
      break;
  }

  drawParticles(ctx, rc.particles);
  if (rc.debug) drawHitboxes(ctx, s);
  ctx.restore();

  drawHud(ctx, s, vp, frame);

  if (rc.whiteout > 0) {
    ctx.globalAlpha = Math.min(1, rc.whiteout);
    ctx.fillStyle = '#F3F0FF';
    ctx.fillRect(0, 0, W, s.h);
    ctx.globalAlpha = 1;
  }
}

/** Afterhour: the segment's own renderLevel(), plus a meta-strip on top. */
export function renderAfterhour(rc: RenderContext, ah: AfterhourState, frame: number): void {
  renderLevel(rc, ah.segment, frame);
  const top = 16 + rc.vp.safeTop;
  drawAfterhourMeta(rc.ctx, ah, top, frame);
}

/** The title/menu backdrop: the same city, without a level running. */
export function renderIdle(rc: RenderContext, h: number, frame: number): void {
  const { ctx, vp } = rc;
  clear(ctx, vp);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#140F2E');
  g.addColorStop(0.6, '#0B0A1C');
  g.addColorStop(1, INK);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, h);

  // A slow horizon of blocks, so the title screen isn't dead.
  ctx.fillStyle = '#0E0C22';
  for (let i = -1; i < 8; i++) {
    const x = ((i * 62 - frame * 0.12) % (W + 124)) - 62;
    const bh = 40 + ((i * 37) % 5) * 22;
    ctx.fillRect(x, h * 0.62 - bh, 52, bh);
  }
  ctx.fillStyle = 'rgba(255,45,111,0.6)';
  ctx.fillRect(0, h * 0.62, W, 1);

  updateParticles(rc.particles);
  drawParticles(ctx, rc.particles);
}

/** Hitbox / channel overlay for the dev harness. Never drawn in normal play. */
function drawHitboxes(ctx: CanvasRenderingContext2D, s: AnyLevelState): void {
  ctx.save();
  ctx.strokeStyle = '#FF2D6F';
  ctx.lineWidth = 1;
  const circle = (x: number, y: number, r: number) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  };
  switch (s.level) {
    case 'pfand': {
      ctx.strokeRect(TUNING.pfand.playerX, s.py - TUNING.pfand.hitH, TUNING.pfand.hitW, TUNING.pfand.hitH);
      ctx.strokeStyle = '#23D3C4';
      for (const it of s.items) {
        if (!it.active) continue;
        ctx.strokeRect(it.x - it.w / 2, it.y - it.h / 2, it.w, it.h);
      }
      break;
    }
    case 'sisyphos': {
      const py = s.h - TUNING.sisyphos.playerYOffset;
      circle(s.x, py, TUNING.sisyphos.playerR);
      ctx.strokeStyle = '#23D3C4';
      for (const b of s.bouncers) {
        if (!b.active) continue;
        circle(b.x, py - (b.wy - s.progress_px), TUNING.sisyphos.bouncerR);
      }
      break;
    }
    case 'katjes': {
      const py = s.h - TUNING.katjes.playerYOffset;
      ctx.strokeRect(s.x - TUNING.katjes.playerW / 2, py - 6, TUNING.katjes.playerW, TUNING.katjes.catchBandTop + 6);
      ctx.strokeStyle = '#23D3C4';
      for (const it of s.items) {
        if (!it.active) continue;
        circle(it.x, it.y, TUNING.katjes.itemR);
      }
      break;
    }
    case 'kayak': {
      const py = s.h - TUNING.kayak.playerYOffset;
      circle(s.x, py, TUNING.kayak.hullR);
      ctx.strokeStyle = '#23D3C4';
      for (const r of s.rocks) {
        if (!r.active) continue;
        circle(r.x, py - (r.wy - s.travel), r.r);
      }
      break;
    }
  }
  ctx.restore();
}
