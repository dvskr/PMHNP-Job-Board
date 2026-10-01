/**
 * The category-city FAQ names a state's practice authority level and then
 * says what that level means for PMHNPs, inside FAQPage JSON-LD.
 *
 * Until 2026-10-01 the second half was picked with includes('Full') and
 * includes('Reduced') against the lowercase PracticeAuthority union. Neither
 * ever matched, so every state, full practice ones included, was described
 * as requiring physician supervision right after the sentence that named
 * its full practice authority.
 */
import { describe, it, expect } from 'vitest';
import {
    STATE_PRACTICE_AUTHORITY,
    getAuthorityImplication,
    type PracticeAuthority,
} from '@/lib/state-practice-authority';

describe('practice authority implication', () => {
    it('describes each level by its own meaning', () => {
        expect(getAuthorityImplication('full')).toMatch(/independently/);
        expect(getAuthorityImplication('full')).not.toMatch(/supervision|collaborative/);
        expect(getAuthorityImplication('reduced')).toMatch(/collaborative agreement/);
        expect(getAuthorityImplication('restricted')).toMatch(/supervision/);
    });

    it('gives the three levels three different sentences', () => {
        const levels: PracticeAuthority[] = ['full', 'reduced', 'restricted'];
        expect(new Set(levels.map(getAuthorityImplication)).size).toBe(3);
    });

    it('never tells a full practice state that supervision is required', () => {
        const full = Object.values(STATE_PRACTICE_AUTHORITY).filter((info) => info.authority === 'full');
        expect(full.length).toBeGreaterThan(0);
        for (const info of full) {
            expect(getAuthorityImplication(info.authority)).not.toMatch(/supervision/);
        }
    });
});
