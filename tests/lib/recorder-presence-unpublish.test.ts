import { describe, it, expect, vi } from 'vitest';
import { HealthRecorder } from '../../lib/health/recorder';

function fakePrisma() {
    const createMany = vi.fn().mockResolvedValue({ count: 0 });
    return {
        prisma: {
            jobHealthCheck: { createMany },
        } as unknown as ConstructorParameters<typeof HealthRecorder>[0],
        createMany,
    };
}

describe('HealthRecorder.stagePresenceUnpublish', () => {
    it('builds a source_presence row with presence_unpublished outcome', async () => {
        const { prisma, createMany } = fakePrisma();
        const r = new HealthRecorder(prisma, 1);
        await r.stagePresenceUnpublish({
            id: 'job-42',
            sourceProvider: 'jooble',
            healthConsecutiveMissing: 4,
        });
        expect(createMany).toHaveBeenCalledOnce();
        const row = createMany.mock.calls[0][0].data[0];
        expect(row.jobId).toBe('job-42');
        expect(row.checkType).toBe('source_presence');
        expect(row.outcome).toBe('presence_unpublished');
        expect(row.alive).toBe(false);
        expect(row.presenceSource).toBe('jooble');
        expect(row.presenceMissing).toBe(4);
        expect(row.checkerVersion).toMatch(/^presence-unpublish-/);
    });

    it('handles null sourceProvider', async () => {
        const { prisma, createMany } = fakePrisma();
        const r = new HealthRecorder(prisma, 1);
        await r.stagePresenceUnpublish({
            id: 'job-43',
            sourceProvider: null,
            healthConsecutiveMissing: 3,
        });
        const row = createMany.mock.calls[0][0].data[0];
        expect(row.presenceSource).toBeNull();
    });

    it('respects batchSize for auto-flush', async () => {
        const { prisma, createMany } = fakePrisma();
        const r = new HealthRecorder(prisma, 3);
        await r.stagePresenceUnpublish({ id: 'j1', sourceProvider: 'jooble', healthConsecutiveMissing: 3 });
        await r.stagePresenceUnpublish({ id: 'j2', sourceProvider: 'jooble', healthConsecutiveMissing: 3 });
        expect(createMany).not.toHaveBeenCalled();
        await r.stagePresenceUnpublish({ id: 'j3', sourceProvider: 'jooble', healthConsecutiveMissing: 4 });
        expect(createMany).toHaveBeenCalledOnce();
        expect(r.stats().flushed).toBe(3);
    });
});
