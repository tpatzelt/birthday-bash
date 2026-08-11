/**
 * Pooled particles, driven by `state.events`.
 *
 * Nothing here allocates after boot: the target device is a mid-range Android,
 * where GC pauses read as stutter and stutter reads as "the game is broken"
 * (ARCHITECTURE.md).
 */

import { forEachEvent, type BaseState, type GameEvent } from '../core/state.js';
import { DT } from '../config/tuning.js';

type Particle = {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  gravity: number;
  color: string;
  /** 0 = dot, 1 = spark (line), 2 = ring, 3 = confetti strip. */
  shape: number;
  spin: number;
  angle: number;
};

const POOL = 220;

export type Particles = {
  pool: Particle[];
  next: number;
  reduced: boolean;
};

export function makeParticles(reducedMotion = false): Particles {
  const pool: Particle[] = new Array(POOL);
  for (let i = 0; i < POOL; i++) {
    pool[i] = {
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 1,
      size: 3,
      gravity: 0,
      color: '#fff',
      shape: 0,
      spin: 0,
      angle: 0,
    };
  }
  return { pool, next: 0, reduced: reducedMotion };
}

function spawn(
  p: Particles,
  x: number,
  y: number,
  vx: number,
  vy: number,
  life: number,
  size: number,
  color: string,
  shape: number,
  gravity: number,
): void {
  // Round-robin over the pool: an old particle being cut short is invisible,
  // an allocation is not.
  const q = p.pool[p.next];
  p.next = (p.next + 1) % POOL;
  q.active = true;
  q.x = x;
  q.y = y;
  q.vx = vx;
  q.vy = vy;
  q.life = life;
  q.maxLife = life;
  q.size = size;
  q.color = color;
  q.shape = shape;
  q.gravity = gravity;
  q.spin = (vx + vy) * 0.02;
  q.angle = 0;
}

/** A cheap deterministic-enough scatter; visuals never feed back into the sim. */
let noise = 1;
function rnd(): number {
  noise = (noise * 1664525 + 1013904223) % 4294967296;
  return noise / 4294967296;
}

export function burst(
  p: Particles,
  x: number,
  y: number,
  count: number,
  color: string,
  speed = 120,
  shape = 0,
): void {
  const n = p.reduced ? Math.ceil(count / 3) : count;
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const s = speed * (0.35 + rnd() * 0.85);
    spawn(p, x, y, Math.cos(a) * s, Math.sin(a) * s - 40, 0.35 + rnd() * 0.5, 2 + rnd() * 2.5, color, shape, 900);
  }
}

export function confetti(p: Particles, w: number, h: number, count = 120): void {
  const n = p.reduced ? Math.ceil(count / 4) : count;
  const colors = ['#FF2D6F', '#FFB300', '#23D3C4', '#F3F0FF'];
  for (let i = 0; i < n; i++) {
    spawn(
      p,
      rnd() * w,
      -20 - rnd() * h * 0.5,
      (rnd() - 0.5) * 90,
      120 + rnd() * 180,
      2.2 + rnd() * 1.6,
      3 + rnd() * 4,
      colors[i % colors.length],
      3,
      140,
    );
  }
}

/** Translate this frame's game events into juice. */
export function consumeEvents(p: Particles, s: BaseState): void {
  forEachEvent(s, (e: GameEvent) => {
    switch (e.type) {
      case 'bottle':
        burst(p, e.x, e.y, 7, '#FFB300', 130);
        break;
      case 'bonus':
        burst(p, e.x, e.y, 14, '#FF2D6F', 170);
        break;
      case 'fish':
        burst(p, e.x, e.y, 5, '#F3F0FF', 90);
        break;
      case 'veg':
        burst(p, e.x, e.y, 12, '#5ED17A', 150);
        break;
      case 'hit':
        burst(p, e.x, e.y, 16, '#FF2D6F', 190);
        break;
      case 'jump':
        burst(p, e.x, e.y, 4, '#B9B4D6', 60);
        break;
      case 'land':
        burst(p, e.x, e.y, 3, '#B9B4D6', 45);
        break;
      case 'shades':
        burst(p, e.x, e.y, 12, '#23D3C4', 160, 2);
        break;
      case 'rock':
        burst(p, e.x, e.y, 12, '#23D3C4', 150);
        break;
      case 'bounce':
        burst(p, e.x, e.y, 4, e.a === 1 ? '#5ED17A' : '#B9B4D6', 70);
        break;
      case 'stamp':
        burst(p, e.x, e.y, 24, '#FF2D6F', 220);
        break;
      case 'win':
        burst(p, e.x, e.y, 26, '#FFB300', 230);
        break;
      default:
        break;
    }
  });
}

export function updateParticles(p: Particles): void {
  for (let i = 0; i < p.pool.length; i++) {
    const q = p.pool[i];
    if (!q.active) continue;
    q.life -= DT;
    if (q.life <= 0) {
      q.active = false;
      continue;
    }
    q.vy += q.gravity * DT;
    q.x += q.vx * DT;
    q.y += q.vy * DT;
    q.angle += q.spin;
  }
}

export function drawParticles(ctx: CanvasRenderingContext2D, p: Particles): void {
  for (let i = 0; i < p.pool.length; i++) {
    const q = p.pool[i];
    if (!q.active) continue;
    const t = q.life / q.maxLife;
    ctx.globalAlpha = t < 0.4 ? t / 0.4 : 1;
    ctx.fillStyle = q.color;
    if (q.shape === 2) {
      ctx.strokeStyle = q.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.size * (2.4 - t), 0, Math.PI * 2);
      ctx.stroke();
    } else if (q.shape === 3) {
      ctx.save();
      ctx.translate(q.x, q.y);
      ctx.rotate(q.angle);
      ctx.fillRect(-q.size / 2, -q.size * 1.4, q.size, q.size * 2.8);
      ctx.restore();
    } else {
      ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
  }
  ctx.globalAlpha = 1;
}

export function clearParticles(p: Particles): void {
  for (let i = 0; i < p.pool.length; i++) p.pool[i].active = false;
}

export function activeCount(p: Particles): number {
  let n = 0;
  for (let i = 0; i < p.pool.length; i++) if (p.pool[i].active) n++;
  return n;
}
