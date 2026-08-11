import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

function gitSha(): string {
  if (process.env.GIT_SHA) return process.env.GIT_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

/** `/__dev` is a route, not a file: serve the app there in `vite dev` too. */
const devRoute = {
  name: 'bb-dev-route',
  configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: unknown, next: () => void) => void) => void } }) {
    server.middlewares.use((req, _res, next) => {
      if (req.url && req.url.replace(/\?.*$/, '').replace(/\/+$/, '').endsWith('/__dev')) req.url = '/index.html';
      next();
    });
  },
};

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [devRoute],
  define: {
    __DEV_HARNESS__: JSON.stringify(mode !== 'production'),
    __BUILD_SHA__: JSON.stringify(gitSha()),
  },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    reportCompressedSize: true,
    rollupOptions: {
      output: {
        // One chunk: the whole game is small and a single request beats
        // waterfalling on 4G.
        manualChunks: undefined,
      },
    },
  },
  server: {
    host: true,
    port: 5173,
  },
}));
