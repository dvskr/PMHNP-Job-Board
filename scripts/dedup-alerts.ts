import { prisma } from '../lib/prisma';

async function main() {
    const alerts = await prisma.jobAlert.findMany({
        orderBy: [{ email: 'asc' }, { createdAt: 'asc' }],
    });

    // Group by email + keyword + location (exact duplicates)
    const seen = new Map<string, string>(); // key -> first alert id
    const toDelete: string[] = [];

    for (const a of alerts) {
        const key = `${a.email}|${a.keyword || ''}|${a.location || ''}|${a.frequency}`;
        if (seen.has(key)) {
            toDelete.push(a.id);
            console.log(`DELETE dupe: ${a.email} kw=${a.keyword || '-'} loc=${a.location || '-'} freq=${a.frequency} (keeping ${seen.get(key)!.slice(0, 12)})`);
        } else {
            seen.set(key, a.id);
        }
    }

    if (toDelete.length === 0) {
        console.log('No exact duplicates found!');
        process.exit(0);
        return;
    }

    const deleted = await prisma.jobAlert.deleteMany({
        where: { id: { in: toDelete } },
    });

    console.log(`\nDeleted ${deleted.count} duplicate alerts`);

    const remaining = await prisma.jobAlert.count();
    console.log(`Remaining alerts: ${remaining}`);
    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
