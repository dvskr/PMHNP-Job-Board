import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for PMHNP Job Board E2E tests.
 *
 * Default target: production (https://pmhnphiring.com).
 * Override with PLAYWRIGHT_BASE_URL env var to test against preview deploys.
 *
 * Run:
 *   npx playwright test                    # all tests
 *   npx playwright test smoke              # smoke tests only
 *   npx playwright test --headed           # see the browser
 *   npx playwright test --ui               # debug mode
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['list'], ['json', { outputFile: 'tests/e2e/.results/results.json' }]]
    : 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://pmhnphiring.com',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Real bots get throttled; identify ourselves so we don't get rate-limited
    extraHTTPHeaders: {
      'User-Agent': 'PMHNP-E2E-Bot/1.0 (Playwright; +https://pmhnphiring.com/contact)',
    },
    // Be nice to production — don't hammer it
    navigationTimeout: 20_000,
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
