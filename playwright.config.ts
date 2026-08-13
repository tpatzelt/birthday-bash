import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against the **production Docker image**, not `vite dev` and not
 * `vite preview` — the exact container that ships, with the same nginx config,
 * headers, asset hashing and service worker (TESTING.md §7).
 *
 * `E2E_BASE_URL` points the same specs at an already-running instance instead,
 * skipping the build-and-serve step.
 */

const PORT = Number(process.env.E2E_PORT ?? 8123);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const external = Boolean(process.env.E2E_BASE_URL);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'pixel-7',
      use: { ...devices['Pixel 7'] },
    },
    // WebKit is where the AudioContext rules and the safe-area handling
    // actually get tested. It needs system libraries that a plain workstation
    // usually lacks (`sudo npx playwright install-deps webkit`); CI installs
    // them, and locally you can run `E2E_SKIP_WEBKIT=1 npm run e2e`.
    {
      name: 'iphone-14',
      use: { ...devices['iPhone 14'] },
      testIgnore: process.env.E2E_SKIP_WEBKIT ? /.*/ : undefined,
    },
  ],
  webServer: external
    ? undefined
    : {
        command: `bash scripts/serve-image.sh ${PORT}`,
        url: `http://127.0.0.1:${PORT}/index.html`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
});
