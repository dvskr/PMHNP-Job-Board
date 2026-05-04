# AI Testing Guide — Cookbook

> Sprint 0.5 deliverable. Before you ship an AI feature, copy this template
> and fill in the blanks. Every layer below is **required by Definition of
> Done** (see [ai-implementation-plan.md §9](./ai-implementation-plan.md#9-definition-of-done--master-checklist)).

The test pyramid for any AI feature has 4 layers (Unit → Integration → E2E →
Eval). Skipping the bottom of the pyramid because "the integration test
covers it" is the line we never get back to.

```
┌─────────────────┐  Eval Tests       Quality of LLM output
│  30+ cases      │                   Custom harness, golden + bias
├─────────────────┤
│  E2E Tests      │  User flow through browser  (Playwright)
│  1–3 paths      │
├─────────────────┤
│  Integration    │  API → mocked LLM → DB → response  (Vitest + mocks)
│  5–10 cases     │
├─────────────────┤
│  Unit Tests     │  Pure functions, schema, sanitizers  (Vitest)
│  15+ cases      │
└─────────────────┘
```

---

## 0. The 60-second checklist

Before opening a PR for an AI feature:

- [ ] Prompt lives in `lib/ai/prompts/<task>/v<n>.json` (NOT inline in any module).
- [ ] Task is registered in `lib/ai/tasks.ts` with primary + fallback + cache TTL + rate limit.
- [ ] Caller threads `tenant`, `promptId`, `promptVersion`, and a stable `cacheKey`.
- [ ] `outputSchema` (Zod) is set; output is validated before persistence.
- [ ] Feature flag exists in `lib/ai/feature-flags.ts` and the call site reads it.
- [ ] Unit tests cover prompt rendering + schema validation + score clamping.
- [ ] Integration test mocks the gateway (use `tests/helpers/ai.ts`) and
      asserts DB writes + cost tracking.
- [ ] At least one E2E happy-path test in `tests/e2e/journeys/`.
- [ ] Golden eval set in `tests/ai/golden/<task>.json` (≥30 cases at
      production maturity; seed fewer to start with a clear TODO).
- [ ] If the feature ranks/scores: bias pair set in `tests/ai/bias/<task>-pairs.json`.
- [ ] Runbook in `docs/runbooks/ai-<task>.md`.
- [ ] PII scanner clean: `npm run lint:pii-prompts`.

---

## 1. Unit tests — `tests/lib/ai/<feature>.test.ts`

Covers pure functions only. No gateway calls, no DB.

```typescript
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { loadPrompt } from '@/lib/ai/prompts/registry';

describe('lib/ai/prompts/<task>', () => {
    it('renders the user template with provided variables', async () => {
        const p = await loadPrompt('<task>');
        const messages = p.render({ jobSummary: 'X', candidateSummary: 'Y' });
        expect(messages[1].content).toContain('X');
    });

    it('rejects missing template variables', async () => {
        const p = await loadPrompt('<task>');
        expect(() => p.render({} as Record<string, string>)).toThrow();
    });
});
```

If the feature has helpers (sanitizers, parsers, score-clampers), test those too.

---

## 2. Integration tests — `tests/lib/<feature>.test.ts`

Mocks the gateway. Assertions cover: DB persistence, cost tracking entry,
fallback path, schema-failure path, rate-limit path, flag-off path.

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installAiGatewayMocks, mockLLMResponse, getRecordedAiCalls, resetAiMocks } from '../helpers/ai';
import { seedTestJob, seedTestCandidate, seedTestApplication } from '../helpers/db';

installAiGatewayMocks();
// THEN import the module under test:
import { scoreCandidate } from '@/lib/candidate-scorer';
import { prisma } from '@/lib/prisma';

beforeEach(() => {
    resetAiMocks();
});

describe('scoreCandidate', () => {
    it('persists a clamped score and writes a cost log entry', async () => {
        const job = seedTestJob();
        const candidate = seedTestCandidate();
        const app = seedTestApplication({ jobId: job.id, userId: candidate.supabaseId });

        (prisma.job.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(job);
        (prisma.userProfile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(candidate);
        (prisma.jobApplication.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(app);
        (prisma.jobApplication.update as ReturnType<typeof vi.fn>).mockResolvedValue(app);

        mockLLMResponse({ content: JSON.stringify({ score: 87, matchReasons: ['CA license matches'], missingItems: [] }) });

        await scoreCandidate(app.id, job.id, candidate.supabaseId);

        const calls = getRecordedAiCalls();
        expect(calls).toHaveLength(1);
        expect(calls[0].task).toBe('candidate_scoring');
        expect(prisma.jobApplication.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ aiMatchScore: 87 }),
        }));
    });
});
```

**Required error paths to cover** (per Definition of Done):
- LLM timeout → fallback engages.
- LLM returns malformed JSON → graceful error.
- Rate limit hit → 429 returned.
- Feature flag OFF → AI code path skipped.

---

## 3. E2E tests — `tests/e2e/journeys/<feature>.spec.ts`

Playwright-driven user flow. At minimum: 1 happy path + 1 error path.

```typescript
import { test, expect } from '@playwright/test';
import { playwrightAuth } from '../helpers/auth';

test.describe('AI feature X', () => {
    test('happy path: user triggers, sees loading state, sees result', async ({ page }) => {
        await playwrightAuth(page, 'candidate', { landingPath: '/dashboard' });
        await page.click('button:has-text("Coach my application")');
        await expect(page.locator('[data-testid="ai-coach-loading"]')).toBeVisible();
        await expect(page.locator('[data-testid="ai-coach-result"]')).toBeVisible({ timeout: 30_000 });
    });

    test('error path: AI unavailable shows a friendly message, not a 500', async ({ page }) => {
        // Turn the flag off via the admin API or env var, then verify the UI
        // renders the non-AI fallback gracefully.
        await playwrightAuth(page, 'candidate');
        await page.goto('/dashboard?ai_kill_test=1');
        await expect(page.locator('[data-testid="ai-coach-fallback"]')).toBeVisible();
    });
});
```

---

## 4. Eval — `tests/ai/golden/<task>.json` and `tests/ai/bias/<task>-pairs.json`

Curate hand-rated cases. Each case is `{ input, expected }` — what we feed
the prompt and what we expect back. Production threshold: 100 cases for
golden, 50 pairs for bias.

```json
{
  "promptVersion": "v1",
  "description": "Cover letter quality eval",
  "cases": [
    {
      "id": "telehealth-strong",
      "input": { "jobSummary": "...", "candidateSummary": "..." },
      "expected": { "expectedScore": 85, "toleranceBand": 10, "mustMention": ["telehealth"], "mustNotMention": ["gender"] }
    }
  ]
}
```

Then register the task in `lib/ai/eval/index.ts` so the runner finds it:

```typescript
EVAL_REGISTRY: {
    '<task>': {
        runGolden: async (opts) => runEvalSuite(await loadGoldenSet(), contract, opts),
        runBias:   async (opts) => runBiasSuite(await loadBiasSet(), contract, opts),
    },
}
```

Run locally:

```bash
npm run eval <task>           # golden
npm run eval <task> --bias    # bias pairs
EVAL_DRY_RUN=1 npm run eval <task>   # validate harness without provider calls
```

CI (`.github/workflows/ai-gates.yml`) runs the eval suite in DRY-RUN mode by
default. To enable live eval on a PR, set the `EVAL_LIVE` repo secret to `1`.
Recommended: leave dry-run for PRs, enable live on merges to main + nightly cron.

---

## 5. PII safety

Two enforcement layers:

1. **Bulk scanner** — `npm run lint:pii-prompts` greps every prompt file in
   `lib/ai/prompts/` for forbidden field references and PII-shaped values.
   Wired as a CI gate in `ai-gates.yml`.

2. **In-test assertion** — `assertNoPIIInPrompt()` from `tests/helpers/pii.ts`
   for inline checks in feature tests. Use when a feature's prompt is
   constructed dynamically from DB rows.

```typescript
import { assertNoPIIInPrompt } from '../helpers/pii';

// Inside an integration test:
const promptText = renderedMessages.map((m) => m.content).join('\n');
assertNoPIIInPrompt(promptText, 'jdGenerator/v1');
```

The full PII rule set lives in [ai-architecture.md §10](./ai-architecture.md#10-privacy--compliance).

---

## 6. Cost + observability checks (a free win)

After the integration test passes, also assert that `getRecordedAiCalls()`
includes the `promptVersion`. That ensures the drift cron and rollback flow
work for your feature.

```typescript
const calls = getRecordedAiCalls();
expect(calls[0]).toMatchObject({
    promptId: '<task>',
    promptVersion: 'v1',
});
```
