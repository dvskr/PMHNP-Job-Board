import { prisma } from '../lib/prisma';

async function main() {
    const alerts = await prisma.jobAlert.findMany({
        select: { id: true, email: true, frequency: true, isActive: true, keyword: true, location: true, createdAt: true },
        orderBy: [{ email: 'asc' }, { createdAt: 'asc' }],
    });

    console.log(`Total job alerts: ${alerts.length}`);

    // Group by email
    const byEmail = new Map<string, typeof alerts>();
    for (const a of alerts) {
        const list = byEmail.get(a.email) || [];
        list.push(a);
        byEmail.set(a.email, list);
    }

    let totalDupes = 0;
    for (const [email, list] of byEmail) {
        if (list.length > 1) {
            totalDupes++;
            console.log(`\nDUPE: ${email} — ${list.length} alerts`);
            list.forEach((a, i) => console.log(`  [${i + 1}] ${a.id.slice(0, 12)}  freq=${a.frequency}  active=${a.isActive}  kw=${a.keyword || '-'}  loc=${a.location || '-'}  date=${a.createdAt.toISOString().slice(0, 10)}`));
        }
    }

    console.log(`\n--- ${totalDupes} emails with duplicates, ${byEmail.size} unique emails, ${alerts.length} total alerts ---`);
    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
