/**
 * The served artifact (TESTING.md §10) — headers, caching, asset resolution.
 *
 * Everything asserted here is `nginx.conf` behaviour baked into the container,
 * so the shipped image is the right thing to check it against. The gameplay
 * specs drive the app and assert nothing about responses; without this file
 * nothing covers the headers at all, and a cached `index.html` is exactly the
 * failure that would strand a fix pushed on the morning of the party.
 */

import { expect, test, type APIRequestContext } from '@playwright/test';

const NO_STORE = /no-cache|no-store/;

async function headers(request: APIRequestContext, path: string): Promise<Record<string, string>> {
  const res = await request.get(path);
  expect(res.status(), `GET ${path}`).toBe(200);
  return res.headers();
}

test.describe('served artifact', () => {
  test('index.html is HTML, uncached, and carries the security headers', async ({ request }) => {
    const h = await headers(request, '/');
    expect(h['content-type']).toContain('text/html');
    // A cached index.html means a phone that already loaded the site never
    // sees a later build.
    expect(h['cache-control'] ?? '').toMatch(NO_STORE);
    expect(h['x-content-type-options']).toContain('nosniff');
    expect(h['referrer-policy']).toContain('no-referrer');
    expect(h['x-frame-options']).toContain('SAMEORIGIN');
    // It is a gift, not a site.
    expect(h['x-robots-tag'] ?? '').toMatch(/\bnoindex\b|\bnone\b/);
  });

  test('the hashed assets in the served HTML resolve and are immutable', async ({ request }) => {
    const html = await (await request.get('/')).text();
    const refs = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((m) => m[1]);
    // Catches a half-built image: HTML from one build, assets from another.
    expect(refs.length, 'HTML references hashed assets').toBeGreaterThan(0);

    for (const ref of refs) {
      const h = await headers(request, ref);
      if (ref.includes('/assets/')) {
        expect(h['cache-control'] ?? '', `cache-control on ${ref}`).toContain('immutable');
      }
    }
  });

  test('sw.js is served as JavaScript and never cached', async ({ request }) => {
    const h = await headers(request, '/sw.js');
    expect(h['content-type']).toContain('javascript');
    // Same reason as index.html: a cached service worker pins the old build.
    expect(h['cache-control'] ?? '').toMatch(NO_STORE);
  });

  test('the manifest is served with the manifest content type', async ({ request }) => {
    const h = await headers(request, '/manifest.webmanifest');
    expect(h['content-type']).toContain('manifest+json');
  });

  test('unknown paths fall back to index.html', async ({ request }) => {
    // `/__dev` is a route in the app, not a file on disk.
    const res = await request.get('/__dev');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/html');
    expect(await res.text()).toContain('JONAS BIRTHDAY BASH');
  });
});
