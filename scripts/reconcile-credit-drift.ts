/**
 * Review, and optionally repair, posting credits that were spent with no
 * posting behind them.
 *
 * The nightly /api/cron/credit-reconciliation sweep finds these and says
 * nothing else. It deliberately does not self-heal: drift is inferred from
 * EmployerJob rows that the admin routes can hard delete, so an automatic
 * restore would mint a free credit every time an admin removed a credit
 * funded posting. Whether a deleted posting should cost the employer a
 * credit is a judgement, so a person makes it here.
 *
 *   Review everything (writes nothing):
 *     npx tsx scripts/reconcile-credit-drift.ts
 *
 *   Restore one pack, after looking at it:
 *     npx tsx scripts/reconcile-credit-drift.ts --apply --pack <packId>
 *
 * BEFORE RESTORING, check the postings the pack funded. If the missing one
 * was deleted by an admin for cause, the credit is not owed and you should
 * leave it alone. If it simply never existed, it is owed.
 *
 * Target production by exporting PROD_DIRECT_DATABASE_URL into DIRECT_URL
 * and DATABASE_URL; the script prints the host before it does anything.
 */
import { prisma } from '@/lib/prisma';
import { findCreditDrift, QUIET_PERIOD_MINUTES } from '@/lib/credit-reconciliation';

function arg(name: string): string | null {
    const i = process.argv.indexOf(name);
    return i > -1 ? process.argv[i + 1] ?? null : null;
}

async function main(): Promise<void> {
    const apply = process.argv.includes('--apply');
    const packId = arg('--pack');

    const host = (process.env.DIRECT_URL || process.env.DATABASE_URL || '')
        .replace(/^.*@([^/:]+).*$/, '$1');
    console.log(`database host: ${host || 'unknown'}`);
    console.log(apply ? `mode: APPLY (pack ${packId})` : 'mode: review (no writes)');
    console.log(`quiet period: ${QUIET_PERIOD_MINUTES} minutes\n`);

    const report = await findCreditDrift();

    console.log(`packs checked:     ${report.packsChecked}`);
    console.log(`shortfalls:        ${report.shortfalls.length}`);
    console.log(`credits owed:      ${report.creditsOwed}`);
    console.log(`over deliveries:   ${report.overDeliveries.length}\n`);

    if (report.overDeliveries.length > 0) {
        // Cannot be produced by the spend window. Somebody is posting free.
        console.log('OVER DELIVERY (more postings than credits spent). Investigate, do not "fix" here:');
        for (const d of report.overDeliveries) {
            console.log(`  pack ${d.packId}: used ${d.creditsUsed}, postings ${d.postingsFound}`);
        }
        console.log('');
    }

    if (report.shortfalls.length === 0) {
        console.log('no shortfalls. nothing to do.');
        return;
    }

    for (const d of report.shortfalls) {
        console.log(`  pack ${d.packId}`);
        console.log(`    total ${d.creditsTotal}, used ${d.creditsUsed}, postings found ${d.postingsFound}`);
        console.log(`    owed ${d.drift}, last touched ${d.lastTouchedAt.toISOString()}`);
    }

    if (!apply) {
        console.log('\nreview only. to restore one pack:');
        console.log('  npx tsx scripts/reconcile-credit-drift.ts --apply --pack <packId>');
        return;
    }

    if (!packId) {
        // One pack at a time, named explicitly. A blanket --apply across
        // every pack is exactly the automatic restore this design rejected.
        console.log('\nrefusing: --apply needs --pack <packId>. Restore one pack at a time,');
        console.log('after checking what happened to the postings it funded.');
        process.exitCode = 1;
        return;
    }

    const target = report.shortfalls.find((d) => d.packId === packId);
    if (!target) {
        console.log(`\nrefusing: pack ${packId} is not in the shortfall list.`);
        process.exitCode = 1;
        return;
    }

    // Conditional and bounded: the WHERE re-checks the counter this run
    // actually read, so a spend landing between the report and this write
    // makes the update match zero rows rather than handing back a credit
    // that has since been used properly.
    const restored = await prisma.postingCreditPack.updateMany({
        where: { id: packId, creditsUsed: target.creditsUsed },
        data: { creditsUsed: target.creditsUsed - target.drift },
    });

    if (restored.count === 0) {
        console.log(`\npack ${packId} changed since the report was taken. Nothing written; re-run.`);
        process.exitCode = 1;
        return;
    }

    console.log(`\nrestored ${target.drift} credit(s) to pack ${packId}.`);
    console.log(`credits_used ${target.creditsUsed} -> ${target.creditsUsed - target.drift}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
