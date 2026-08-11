/**
 * Live smoke after deploy (TESTING.md §10).
 *
 *   npm run smoke:live -- https://jonas.example.com
 *
 * Checks the served artifact itself — headers, asset resolution, version — and
 * then runs the same full-playthrough tape against the live URL on a mobile
 * viewport, asserting the reveal renders. **Run it once more on the morning of
 * the party.**
 */

import { readFileSync } from 'node:fs';
import { chromium, devices } from '@playwright/test';

import { LEVEL_ORDER, type Tape } from '../src/core/input.js';

const url = (process.argv[2] ?? process.env.SMOKE_URL ?? '').replace(/\/+$/, '');
const expectVersion = process.argv[3] ?? process.env.EXPECT_VERSION ?? '';

if (!url) {
  console.error('usage: npm run smoke:live -- https://jonas.example.com [expected-sha]');
  process.exit(2);
}

const problems: string[] = [];
const notes: string[] = [];

function check(ok: boolean, label: string, detail = ''): void {
  if (ok) notes.push(`  ok   ${label}`);
  else problems.push(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main(): Promise<void> {
  // --- the served files ----------------------------------------------------
  const res = await fetch(`${url}/`, { redirect: 'follow' });
  check(res.status === 200, `GET / → 200`, `got ${res.status}`);
  const ctype = res.headers.get('content-type') ?? '';
  check(ctype.includes('text/html'), 'content-type is HTML', ctype);
  const cache = res.headers.get('cache-control') ?? '';
  check(/no-cache|no-store/.test(cache), 'index.html is not cached', cache || 'missing');
  check(
    (res.headers.get('x-content-type-options') ?? '').includes('nosniff'),
    'security headers present',
    'x-content-type-options missing',
  );
  // The homelab's public Caddy block sends `none, noarchive, …`. Per the robots
  // spec `none` is exactly `noindex, nofollow`, so accept either spelling —
  // matching only the literal `noindex` fails a correctly-configured origin.
  const robots = res.headers.get('x-robots-tag') ?? '';
  check(
    /\bnoindex\b/.test(robots) || /\bnone\b/.test(robots),
    'noindex (it is a gift, not a site)',
    robots || 'missing',
  );

  const html = await res.text();

  // Asset hashes in the served HTML actually resolve — catches a half-pushed image.
  const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((m) => m[1]);
  check(assets.length > 0, 'HTML references hashed assets');
  for (const a of assets) {
    const assetUrl = a.startsWith('http') ? a : `${url}/${a.replace(/^\.?\//, '')}`;
    const r = await fetch(assetUrl);
    check(r.status === 200, `asset resolves: ${a}`, `${r.status}`);
    if (a.includes('/assets/')) {
      const cc = r.headers.get('cache-control') ?? '';
      check(cc.includes('immutable'), `asset is immutable: ${a}`, cc || 'missing');
    }
  }

  const sw = await fetch(`${url}/sw.js`);
  check(sw.status === 200, 'service worker is served');
  check(/no-cache|no-store/.test(sw.headers.get('cache-control') ?? ''), 'sw.js is not cached');

  // --- the game itself, on a phone-sized viewport ---------------------------
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  try {
    await page.goto(`${url}/`, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForFunction(() => typeof (window as never as { __bb?: unknown }).__bb !== 'undefined', {
      timeout: 20_000,
    });
    check((await page.locator('#overlay h1').textContent()) === 'BERLIN-QUEST', 'title screen renders');

    const version = await page.evaluate(() => (window as never as { __bb: { version: string } }).__bb.version);
    notes.push(`  →    live version: ${version}`);
    if (expectVersion) {
      // Proves you are looking at the build you think you are, not a cached one.
      check(version.startsWith(expectVersion.slice(0, 7)), `version matches ${expectVersion.slice(0, 7)}`, version);
    }

    for (const level of LEVEL_ORDER) {
      const tape = JSON.parse(readFileSync(`tests/tapes/${level}-win.json`, 'utf8')) as Tape;
      await page.evaluate((t) => {
        const bb = (window as never as { __bb: { freeze(): void; loadTape(t: unknown): boolean; step(n: number): void; unfreeze(): void } }).__bb;
        bb.freeze();
        bb.loadTape(t);
        bb.step((t as Tape).frames.length + 400);
        bb.unfreeze();
      }, tape);
      const phase = await page.evaluate(
        () => (window as never as { __bb: { getState(): { phase: string } } }).__bb.getState().phase,
      );
      check(phase !== 'play', `${level} played through`);
      if (level !== 'kayak') await page.locator('#overlay button.primary').click();
    }

    // Wait for the drop, not just the build: the gift card is hidden until then.
    await page.waitForSelector('#overlay .gift-card', { state: 'visible', timeout: 25_000 });
    const text = ((await page.locator('#overlay').textContent()) ?? '').replace(/\s+/g, ' ');
    check(text.includes('SANDBOX VR'), 'the reveal renders');
    check(/\d{2}\.\d{2}\.\d{4}/.test(text), 'the gift details render');
    check(errors.length === 0, 'no console errors', errors.join(' | '));
  } catch (err) {
    problems.push(`  FAIL playthrough — ${(err as Error).message}`);
  } finally {
    await browser.close();
  }

  console.log(`\nsmoke:live ${url}\n`);
  for (const n of notes) console.log(n);
  for (const p of problems) console.log(p);
  console.log(problems.length === 0 ? '\nRESULT: PASS\n' : `\nRESULT: FAIL (${problems.length})\n`);
  process.exit(problems.length === 0 ? 0 : 1);
}

void main();
