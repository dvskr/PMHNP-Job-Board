/**
 * Vector search helper tests — pure functions only. The DB-touching paths
 * (semanticJobSearch, upsertJobEmbedding) are integration-tested in the
 * Phase 1 sprint where they get wired to a real flow.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    buildJobEmbeddingText,
    buildCandidateEmbeddingText,
    reciprocalRankFusion,
    semanticJobSearch,
    __testing,
} from '@/lib/ai/vector-search';

// semanticJobSearch builds its SQL as a string — capture it via a prisma
// mock so the filter clauses can be asserted without a database.
const queryRawUnsafeMock = vi.fn();
vi.mock('@/lib/prisma', () => ({
    prisma: {
        $queryRawUnsafe: (...args: unknown[]) => queryRawUnsafeMock(...args),
        $executeRawUnsafe: vi.fn(),
    },
}));

describe('lib/ai/vector-search', () => {
    describe('buildJobEmbeddingText', () => {
        it('produces a stable string given stable inputs', () => {
            const job = { title: 'PMHNP', description: 'Telehealth role', state: 'CA', benefits: ['health', '401k'] };
            const a = buildJobEmbeddingText(job);
            const b = buildJobEmbeddingText({ ...job });
            expect(a).toBe(b);
        });

        it('truncates massive descriptions', () => {
            const big = 'x'.repeat(10_000);
            const text = buildJobEmbeddingText({ title: 'T', description: big });
            expect(text.length).toBeLessThan(5_000);
        });

        it('handles missing optional fields without crashing', () => {
            const text = buildJobEmbeddingText({ title: 'T', description: null });
            expect(text).toContain('Title: T');
        });
    });

    describe('buildCandidateEmbeddingText', () => {
        it('omits absent fields silently', () => {
            const text = buildCandidateEmbeddingText({});
            expect(text).toBe('');
        });

        it('includes provided fields in stable order', () => {
            const text = buildCandidateEmbeddingText({
                headline: 'PMHNP',
                yearsExperience: 5,
                skills: ['Telepsych', 'CBT'],
            });
            const lines = text.split('\n');
            expect(lines[0]).toContain('Headline');
            expect(lines[1]).toContain('Years of Experience');
            expect(lines[2]).toContain('Skills');
        });
    });

    describe('reciprocalRankFusion', () => {
        it('reranks an item that ranks highly across multiple lists higher than a single-list winner', () => {
            const vectorRanking  = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
            const keywordRanking = [{ id: 'B' }, { id: 'A' }, { id: 'D' }];

            const fused = reciprocalRankFusion([vectorRanking, keywordRanking]);
            // A and B both rank in both lists; D and C only in one each.
            expect(fused[0].id === 'A' || fused[0].id === 'B').toBe(true);
            const dRank = fused.findIndex((r) => r.id === 'D');
            const cRank = fused.findIndex((r) => r.id === 'C');
            expect(fused.findIndex((r) => r.id === 'A')).toBeLessThan(dRank);
            expect(fused.findIndex((r) => r.id === 'B')).toBeLessThan(cRank);
        });

        it('returns an empty list when all input lists are empty', () => {
            const result = reciprocalRankFusion([]);
            expect(result).toEqual([]);
        });

        it('stays deterministic given the same inputs', () => {
            const a = reciprocalRankFusion([[{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 1 }]]);
            const b = reciprocalRankFusion([[{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 1 }]]);
            expect(a).toEqual(b);
        });
    });

    describe('semanticJobSearch — hard-filter SQL', () => {
        beforeEach(() => {
            queryRawUnsafeMock.mockReset();
            queryRawUnsafeMock.mockResolvedValue([]);
        });

        const lastSql = (): string => queryRawUnsafeMock.mock.calls[0][0] as string;

        it('adds a salary-floor clause over both normalized bounds', async () => {
            await semanticJobSearch([0.1], { minSalary: 140000 });
            expect(lastSql()).toContain(
                '(j.normalized_min_salary >= 140000 OR j.normalized_max_salary >= 140000)',
            );
        });

        it('floors a fractional salary and clamps an oversized one', async () => {
            await semanticJobSearch([0.1], { minSalary: 140000.9 });
            expect(lastSql()).toContain('>= 140000');

            queryRawUnsafeMock.mockClear();
            queryRawUnsafeMock.mockResolvedValue([]);
            await semanticJobSearch([0.1], { minSalary: 99_999_999 });
            expect(lastSql()).toContain('>= 2000000');
        });

        it('drops a non-finite salary instead of interpolating NaN', async () => {
            await semanticJobSearch([0.1], { minSalary: Number.NaN });
            expect(lastSql()).not.toContain('NaN');
            expect(lastSql()).not.toContain('normalized_min_salary');
        });

        it('adds the new-grad clause (NULL min-years qualifies) only when newGradOnly is set', async () => {
            await semanticJobSearch([0.1], { newGradOnly: true });
            expect(lastSql()).toContain(
                '(j.new_grad_friendly = true OR j.min_years_experience = 0 OR j.min_years_experience IS NULL)',
            );

            queryRawUnsafeMock.mockClear();
            queryRawUnsafeMock.mockResolvedValue([]);
            await semanticJobSearch([0.1], {});
            expect(lastSql()).not.toContain('new_grad_friendly');
        });
    });

    describe('toVectorLiteral', () => {
        it('produces a pgvector-compatible bracketed literal', () => {
            expect(__testing.toVectorLiteral([0.1, 0.2, 0.3])).toBe('[0.1,0.2,0.3]');
        });

        it('handles an empty vector', () => {
            expect(__testing.toVectorLiteral([])).toBe('[]');
        });
    });
});
