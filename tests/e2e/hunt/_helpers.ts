import { expect, type Page } from '@playwright/test';

/**
 * Shared instrumentation for the bug-hunt specs under tests/e2e/hunt.
 *
 * attachErrorCollectors(page) wires three listeners onto a page and returns
 * the arrays they fill:
 *   - pageErrors:    uncaught exceptions thrown in the page (page.on('pageerror'))
 *   - consoleErrors: console messages of type "error"
 *   - serverErrors:  any response with HTTP status >= 500
 *
 * assertClean(collected) fails the test when there were page errors, any
 * hydration warning (text containing "Hydration", "#418", "#423" or "#425")
 * or any 5xx response. Console errors that are not hydration warnings are
 * included in the failure message for context but do not fail the test on
 * their own (the dev server logs 401/404 fetches as console errors).
 */
export interface Collected {
  pageErrors: string[];
  consoleErrors: string[];
  serverErrors: string[];
}

const HYDRATION_RE = /Hydration|#418|#423|#425/;

export function attachErrorCollectors(page: Page): Collected {
  const collected: Collected = { pageErrors: [], consoleErrors: [], serverErrors: [] };
  page.on('pageerror', (err) => {
    collected.pageErrors.push(err.message);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') collected.consoleErrors.push(msg.text());
  });
  page.on('response', (res) => {
    if (res.status() >= 500) {
      collected.serverErrors.push(`${res.status()} ${res.request().method()} ${res.url()}`);
    }
  });
  return collected;
}

export function hydrationWarnings(collected: Collected): string[] {
  return [...collected.pageErrors, ...collected.consoleErrors].filter((t) => HYDRATION_RE.test(t));
}

export function assertClean(collected: Collected, label = ''): void {
  const hydration = hydrationWarnings(collected);
  const problems: string[] = [
    ...collected.pageErrors.map((e) => `pageerror: ${e}`),
    ...hydration.map((e) => `hydration: ${e}`),
    ...collected.serverErrors.map((e) => `5xx: ${e}`),
  ];
  const context = collected.consoleErrors.length
    ? `\nconsole errors (informational):\n  ${collected.consoleErrors.slice(0, 10).join('\n  ')}`
    : '';
  expect(
    problems,
    `${label ? label + ': ' : ''}expected no page errors / hydration warnings / 5xx responses but got:\n  ${problems.join('\n  ')}${context}`,
  ).toEqual([]);
}
