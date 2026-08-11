import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      'coverage/**',
      '.scratch/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        console: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        fetch: 'readonly',
        location: 'readonly',
        process: 'readonly',
        __DEV_HARNESS__: 'readonly',
        __BUILD_SHA__: 'readonly',
        AudioContext: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
        HTMLElement: 'readonly',
        HTMLCanvasElement: 'readonly',
        OffscreenCanvas: 'readonly',
        PointerEvent: 'readonly',
        TouchEvent: 'readonly',
        self: 'readonly',
      },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // The service worker runs in a worker global scope, not a window.
    files: ['public/sw.js'],
    languageOptions: {
      globals: {
        self: 'readonly',
        caches: 'readonly',
        fetch: 'readonly',
        Response: 'readonly',
        URL: 'readonly',
      },
    },
  },
  {
    // The rule that matters most: core/ is a pure, deterministic simulation.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/render/*', '**/audio/*', '**/shell/*'], message: 'core/ must not import from render/, audio/ or shell/.' },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'core/ must be DOM-free.' },
        { name: 'document', message: 'core/ must be DOM-free.' },
        { name: 'localStorage', message: 'core/ must be DOM-free.' },
        { name: 'performance', message: 'core/ time is state.frame.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'core/ must use the injected seeded PRNG.' },
        { object: 'Date', property: 'now', message: 'core/ time is state.frame.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'core/ must not read wall-clock time.',
        },
      ],
    },
  },
];
