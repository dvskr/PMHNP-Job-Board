/**
 * Prompt registry tests — load + render + missing-var detection.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { loadPrompt, listPrompts, __testing } from '@/lib/ai/prompts/registry';

beforeEach(() => {
    __testing.clearCache();
});

describe('lib/ai/prompts/registry', () => {
    it('loads the candidate_scoring v1 prompt and reports id + version', async () => {
        const p = await loadPrompt('candidate_scoring');
        expect(p.id).toBe('candidate_scoring');
        expect(p.version).toBe('v1');
        expect(p.rawSystem).toContain('PMHNP');
    });

    it('renders {{var}} placeholders with provided values', async () => {
        const p = await loadPrompt('candidate_scoring');
        const messages = p.render({ jobSummary: 'JOB X', candidateSummary: 'CAND Y' });
        expect(messages[0].role).toBe('system');
        expect(messages[1].role).toBe('user');
        expect(messages[1].content).toContain('JOB X');
        expect(messages[1].content).toContain('CAND Y');
    });

    it('throws when a required template variable is missing', async () => {
        const p = await loadPrompt('candidate_scoring');
        expect(() => p.render({ jobSummary: 'JOB' } as Record<string, string>)).toThrow(/candidateSummary/);
    });

    it('lists every registered prompt', async () => {
        const all = await listPrompts();
        const tasks = all.map((e) => e.task);
        expect(tasks).toContain('candidate_scoring');
        expect(tasks).toContain('resume_parsing');
    });

    it('renderTemplate ignores variables not referenced in the template', () => {
        const out = __testing.renderTemplate('Hello {{name}}', { name: 'Sam', extra: 'noop' });
        expect(out).toBe('Hello Sam');
    });
});
