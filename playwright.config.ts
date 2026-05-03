import { defineConfig, devices } from '@playwright/test';
import { config as dotenvConfig } from 'dotenv';
import path from 'path';

// Load credentials from .env.test (gitignored). Falls back to .env if present.
dotenvConfig({ path: path.resolve(__dirname, '.env.test') });
dotenvConfig({ path: path.resolve(__dirname, '.env') });

/**
 * Playwright config for PMHNP Job Board E2E tests.
 *
 * Default target: localhost:3000 (your dev server).
 * Set PLAYWRIGHT_BASE_URL to override (e.g., a Vercel preview URL):
 *   PLAYWRIGHT_BASE_URL=https://pmhnphiring.com npx playwright test
 *
 * Run:
 *   npm run test:e2e              # full suite, auto-starts dev server
 *   npm run test:e2e:smoke        # smoke tests only
 *   npm run test:e2e:ui           # debug mode (visual)
 *   npx playwright test --headed  # see the browser
 *
 * Auth-gated and mutation tests need credentials in .env.test — see .env.test.example.
 */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const IS_LOCAL = BASE_URL.includes('localhost') || BASE_URL.includes('127.0.0.1');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // mutation tests share state; serialize for reliability
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1, // single worker so signup/apply/etc. don't race
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['list'], ['json', { outputFile: 'tests/e2e/.results/results.json' }]]
    : [['html', { open: 'never' }], ['list']],
  timeout: 60_000,           // local dev pages can be slow on first compile
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    extraHTTPHeaders: {
      'User-Agent': 'PMHNP-E2E-Bot/1.0 (Playwright)',
    },
    navigationTimeout: 30_000,
    actionTimeout: 20_000,
  },
  // Auto-start the Next.js dev server when running against localhost.
  // Reuses an already-running server (so `npm run dev` in another terminal works).
  webServer: IS_LOCAL
    ? {
        command: 'npm run dev:nomigrate',
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 180_000, // first compile of a Next.js app can take a while
        stdout: 'ignore',
        stderr: 'pipe',
      }
    : undefined,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
