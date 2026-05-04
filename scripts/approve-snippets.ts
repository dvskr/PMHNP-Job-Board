/**
 * Review + bulk-approve helper for the Layer 2 LLM-generated snippets.
 *
 * Snippets land in the DB with `approved_at = NULL` so the renderer skips
 * them. Use this script to read drafts, decide what to keep, and approve.
 *
 * Modes:
 *   --list           : print every unapproved row with its body (review queue)
 *   --list-approved  : print every approved row (for sanity / rollback)
 *   --approve-all    : flip all unapproved rows to approved
 *   --approve-recent : approve only rows generated in the last N hours
 *                      (default 6) — pairs with the most recent generator run
 *   --approve <slug> : approve a specific city slug (also use --category for taxonomy)
 *   --reject <slug>  : delete the snippet so renderer falls back to Layer 1
 *
 * Examples:
 *   npx tsx scripts/approve-snippets.ts --list
 *   npx tsx scripts/approve-snippets.ts --list --category va
 *   npx tsx scripts/approve-snippets.ts --approve-recent 12
 *   npx tsx scripts/approve-snippets.ts --approve boston-ma
 *   npx tsx scripts/approve-snippets.ts --approve boston-ma --category va
 *   npx tsx scripts/approve-snippets.ts --reject boston-ma
 *   npx tsx scripts/approve-snippets.ts --approve-all --dry
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });
dotenvConfig({ path: '.env' });
dotenvConfig({ path: '.env.prod' });

const ARGS = process.argv.slice(2);
const has = (flag: string) => ARGS.includes(flag);
const valOf = (flag: string): string | undefined => {
    const i = ARGS.indexOf(flag);
    return i >= 0 ? ARGS[i + 1] : undefined;
};

const DRY = has('--dry') || has('--dry-run');
const LIST = has('--list');
const LIST_APPROVED = has('--list-approved');
const APPROVE_ALL = has('--approve-all');
const APPROVE_RECENT = has('--approve-recent');
const RECENT_HOURS = parseInt(valOf('--approve-recent') ?? '6', 10) || 6;
const APPROVE_SLUG = valOf('--approve');
const REJECT_SLUG = valOf('--reject');
const CATEGORY = valOf('--category');

type PrismaModule = typeof import('@/lib/prisma');
let prismaCache: PrismaModule['prisma'] | null = null;
async function getPrisma() {
    if (!prismaCache) prismaCache = (await import('@/lib/prisma')).prisma;
    return prismaCache;
}

function fmtRow(label: string, body: string, model: string | null, generatedAt: Date, approvedAt: Date | null) {
    const status = approvedAt ? `✓ approved ${approvedAt.toISOString().slice(0, 16).replace('T', ' ')}` : '○ pending review';
    return [
        '─'.repeat(76),
        `${label}    [${status}]    model=${model ?? 'unknown'}    gen=${generatedAt.toISOString().slice(0, 16).replace('T', ' ')}`,
        body,
    ].join('\n');
}

async function listRows(opts: { approved: boolean }) {
    const prisma = await getPrisma();
    if (CATEGORY) {
        const rows = await prisma.categoryCitySnippet.findMany({
            where: {
                categorySlug: CATEGORY,
                approvedAt: opts.approved ? { not: null } : null,
            },
            orderBy: [{ generatedAt: 'desc' }],
        });
        console.log(`${rows.length} ${opts.approved ? 'approved' : 'unapproved'} taxonomy snippets for category="${CATEGORY}":`);
        for (const r of rows) {
            console.log(fmtRow(`${r.categorySlug} × ${r.citySlug}`, r.body, r.sourceModel, r.generatedAt, r.approvedAt));
        }
    } else {
        const cityRows = await prisma.citySnippet.findMany({
            where: { approvedAt: opts.approved ? { not: null } : null },
            orderBy: [{ generatedAt: 'desc' }],
        });
        const taxRows = await prisma.categoryCitySnippet.findMany({
            where: { approvedAt: opts.approved ? { not: null } : null },
            orderBy: [{ generatedAt: 'desc' }],
        });
        console.log(`\n=== City snippets (${cityRows.length}) ===`);
        for (const r of cityRows) {
            console.log(fmtRow(`city: ${r.citySlug}`, r.body, r.sourceModel, r.generatedAt, r.approvedAt));
        }
        console.log(`\n=== Taxonomy snippets (${taxRows.length}) ===`);
        for (const r of taxRows) {
            console.log(fmtRow(`${r.categorySlug} × ${r.citySlug}`, r.body, r.sourceModel, r.generatedAt, r.approvedAt));
        }
    }
}

async function approveAll() {
    const prisma = await getPrisma();
    const cityCount = await prisma.citySnippet.count({ where: { approvedAt: null } });
    const taxCount = await prisma.categoryCitySnippet.count({ where: { approvedAt: null } });
    console.log(`Would approve ${cityCount} city + ${taxCount} taxonomy unapproved snippets.`);
    if (DRY) return;
    const now = new Date();
    await prisma.citySnippet.updateMany({ where: { approvedAt: null }, data: { approvedAt: now } });
    await prisma.categoryCitySnippet.updateMany({ where: { approvedAt: null }, data: { approvedAt: now } });
    console.log(`Approved.`);
}

async function approveRecent() {
    const prisma = await getPrisma();
    const since = new Date(Date.now() - RECENT_HOURS * 3600_000);
    const cityCount = await prisma.citySnippet.count({
        where: { approvedAt: null, generatedAt: { gte: since } },
    });
    const taxCount = await prisma.categoryCitySnippet.count({
        where: { approvedAt: null, generatedAt: { gte: since } },
    });
    console.log(`Would approve ${cityCount} city + ${taxCount} taxonomy snippets generated in the last ${RECENT_HOURS}h.`);
    if (DRY) return;
    const now = new Date();
    await prisma.citySnippet.updateMany({
        where: { approvedAt: null, generatedAt: { gte: since } },
        data: { approvedAt: now },
    });
    await prisma.categoryCitySnippet.updateMany({
        where: { approvedAt: null, generatedAt: { gte: since } },
        data: { approvedAt: now },
    });
    console.log(`Approved.`);
}

async function approveOne(slug: string) {
    const prisma = await getPrisma();
    const now = new Date();
    if (CATEGORY) {
        const r = await prisma.categoryCitySnippet.findUnique({
            where: { categorySlug_citySlug: { categorySlug: CATEGORY, citySlug: slug } },
        });
        if (!r) { console.error(`No taxonomy snippet for ${CATEGORY} × ${slug}`); process.exit(1); }
        console.log(fmtRow(`${CATEGORY} × ${slug}`, r.body, r.sourceModel, r.generatedAt, r.approvedAt));
        if (r.approvedAt) { console.log(`Already approved.`); return; }
        if (DRY) { console.log(`--dry: would approve.`); return; }
        await prisma.categoryCitySnippet.update({
            where: { categorySlug_citySlug: { categorySlug: CATEGORY, citySlug: slug } },
            data: { approvedAt: now },
        });
        console.log(`Approved.`);
    } else {
        const r = await prisma.citySnippet.findUnique({ where: { citySlug: slug } });
        if (!r) { console.error(`No city snippet for ${slug}`); process.exit(1); }
        console.log(fmtRow(`city: ${slug}`, r.body, r.sourceModel, r.generatedAt, r.approvedAt));
        if (r.approvedAt) { console.log(`Already approved.`); return; }
        if (DRY) { console.log(`--dry: would approve.`); return; }
        await prisma.citySnippet.update({ where: { citySlug: slug }, data: { approvedAt: now } });
        console.log(`Approved.`);
    }
}

async function rejectOne(slug: string) {
    const prisma = await getPrisma();
    if (CATEGORY) {
        const found = await prisma.categoryCitySnippet.findUnique({
            where: { categorySlug_citySlug: { categorySlug: CATEGORY, citySlug: slug } },
        });
        if (!found) { console.error(`No row to reject.`); process.exit(1); }
        console.log(fmtRow(`${CATEGORY} × ${slug}`, found.body, found.sourceModel, found.generatedAt, found.approvedAt));
        if (DRY) { console.log(`--dry: would delete.`); return; }
        await prisma.categoryCitySnippet.delete({
            where: { categorySlug_citySlug: { categorySlug: CATEGORY, citySlug: slug } },
        });
        console.log(`Deleted. Renderer will fall back to Layer 1 narrative.`);
    } else {
        const found = await prisma.citySnippet.findUnique({ where: { citySlug: slug } });
        if (!found) { console.error(`No row to reject.`); process.exit(1); }
        console.log(fmtRow(`city: ${slug}`, found.body, found.sourceModel, found.generatedAt, found.approvedAt));
        if (DRY) { console.log(`--dry: would delete.`); return; }
        await prisma.citySnippet.delete({ where: { citySlug: slug } });
        console.log(`Deleted. Renderer will fall back to Layer 1 narrative.`);
    }
}

async function main() {
    if (LIST_APPROVED) {
        await listRows({ approved: true });
    } else if (LIST) {
        await listRows({ approved: false });
    } else if (APPROVE_ALL) {
        await approveAll();
    } else if (APPROVE_RECENT) {
        await approveRecent();
    } else if (APPROVE_SLUG) {
        await approveOne(APPROVE_SLUG);
    } else if (REJECT_SLUG) {
        await rejectOne(REJECT_SLUG);
    } else {
        console.log(`Usage: see header comment in scripts/approve-snippets.ts`);
        console.log(``);
        console.log(`Quick start:`);
        console.log(`  npx tsx scripts/approve-snippets.ts --list                    # see pending drafts`);
        console.log(`  npx tsx scripts/approve-snippets.ts --approve-recent 6        # approve last run`);
        console.log(`  npx tsx scripts/approve-snippets.ts --approve boston-ma       # approve one city`);
        console.log(`  npx tsx scripts/approve-snippets.ts --reject boston-ma        # delete (fall back to Layer 1)`);
    }
}

main()
    .catch((err) => { console.error(err); process.exit(1); })
    .finally(async () => { if (prismaCache) await prismaCache.$disconnect(); });
