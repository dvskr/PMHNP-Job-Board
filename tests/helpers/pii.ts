/**
 * PII assertion helper for tests — Sprint 0.5.3.
 *
 * Use in any feature test that constructs a prompt for the gateway. Lets the
 * test fail loudly if a forbidden field name or PII-shaped value sneaks into
 * the prompt body before the bulk PII scanner (npm run lint:pii-prompts)
 * catches it on the registry side.
 *
 *   import { assertNoPIIInPrompt } from '../../helpers/pii';
 *
 *   const messages = await buildPromptForFeatureX(...);
 *   assertNoPIIInPrompt(messages.map((m) => m.content).join('\n'));
 */

import { __testing as scanner } from '@/scripts/scan-prompt-pii';

export class PIIDetectedInPromptError extends Error {
    constructor(message: string, readonly violations: ReadonlyArray<{ pattern: string; snippet: string }>) {
        super(message);
        this.name = 'PIIDetectedInPromptError';
    }
}

export function assertNoPIIInPrompt(text: string, label = 'prompt'): void {
    const violations = scanner.findViolations(label, 'system', text);
    if (violations.length === 0) return;

    const lines = violations.map((v) => `  ✗ ${v.pattern} :: ${v.snippet.slice(0, 80).replace(/\n/g, ' ⏎ ')}`);
    throw new PIIDetectedInPromptError(
        `PII detected in ${label}:\n${lines.join('\n')}\nSee docs/ai-architecture.md §10.`,
        violations.map((v) => ({ pattern: v.pattern, snippet: v.snippet })),
    );
}
