/**
 * Simulate the dead-link cron's exact write pattern against prod DB.
 *
 * Mimics what `runSweep` in app/api/cron/check-dead-links does:
 *   - Build N HealthDecision objects (mix of alive + dead + inconclusive)
 *   - Stage them via HealthRecorder.stageDecision
 *   - Call recorder.flush() at end
 *   - Print recorder.stats()
 *
 * If this works locally, the failure is specific to the deployed Vercel
 * runtime (network, env, RLS, etc.). If it fails locally, we've reproduced
 * the bug and can read the actual error message.
 *
 * Read-only on jobs; writes test audit rows then deletes them.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';
import { HealthRecorder } from '@/lib/health';
import type { HealthDecision } from '@/lib/health';

const TEST_VERSION = 'simulate-cron-write-v1';
const SAMPLE_SIZE = 250;

function fakeAliveDecision(): HealthDecision {
    return {
        alive: true,
        reason: 'alive_2xx',
        evidence: {
            finalStatus: 200,
            finalUrl: 'https://example.com/job',
            redirectHops: 0,
            softMatch: null,
            elapsedMs: 412,
            errorKind: null,
            errorMessage: null,
            checkerVersion: TEST_VERSION,
            sourceProbe: null,
        },
    };
}

function fakeDeadDecision(): HealthDecision {
    return {
        alive: false,
        reason: 'http_404',
        evidence: {
            finalStatus: 404,
            finalUrl: 'https://example.com/job',
            redirectHops: 0,
            softMatch: null,
            elapsedMs: 380,
            errorKind: null,
            errorMessage: null,
            checkerVersion: TEST_VERSION,
            sourceProbe: null,
        },
    };
}

function fakeSoft404Decision(): HealthDecision {
    return {
        alive: false,
        reason: 'soft_404',
        evidence: {
            finalStatus: 200,
            finalUrl: 'https://example.com/job',
            redirectHops: 1,
            softMatch: { patternId: 'gh_position_unavailable', matchText: 'no longer accepting applications', location: 'body' },
            elapsedMs: 520,
            errorKind: null,
            errorMessage: null,
            checkerVersion: TEST_VERSION,
            sourceProbe: null,
        },
    };
}

async function main(): Promise<void> {
    console.log('Loading sample jobs...');
    const jobs = await prisma.job.findMany({
        where: { isPublished: true },
        select: { id: true },
        take: SAMPLE_SIZE,
    });
    console.log(`  Got ${jobs.length} sample job IDs.\n`);

    const recorder = new HealthRecorder(prisma);

    console.log(`Staging ${jobs.length} decisions (mixed outcomes)...`);
    for (let i = 0; i < jobs.length; i++) {
        const j = jobs[i];
        if (!j) continue;
        const pick = i % 3;
        const decision =
            pick === 0 ? fakeAliveDecision() : pick === 1 ? fakeDeadDecision() : fakeSoft404Decision();
        await recorder.stageDecision(j.id, decision);
    }
    console.log(`  Buffered. Flushing remainder...\n`);

    await recorder.flush();

    const stats = recorder.stats();
    console.log('Recorder stats:');
    console.log(`  staged:        ${stats.staged}`);
    console.log(`  flushed:       ${stats.flushed}`);
    console.log(`  failedFlushes: ${stats.failedFlushes}`);
    console.log(`  lastError:     ${stats.lastError ?? '(none)'}\n`);

    // Verify in DB
    const inserted = await prisma.jobHealthCheck.count({
        where: { checkerVersion: TEST_VERSION },
    });
    console.log(`Rows actually in DB with checkerVersion=${TEST_VERSION}: ${inserted}\n`);

    if (stats.failedFlushes > 0 || inserted < stats.flushed) {
        console.log('⚠️  Some writes failed silently. Bug is reproducible LOCALLY.');
    } else if (stats.flushed === stats.staged && inserted === stats.staged) {
        console.log('✓ Local writes work cleanly. Bug is specific to deployed Vercel runtime.');
    } else {
        console.log('? Mixed result. Investigate.');
    }

    // Cleanup
    const deleted = await prisma.jobHealthCheck.deleteMany({
        where: { checkerVersion: TEST_VERSION },
    });
    console.log(`Cleaned up ${deleted.count} test row(s).`);

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('Simulation failed at top level:', err);
    await prisma.$disconnect();
    process.exit(1);
});
