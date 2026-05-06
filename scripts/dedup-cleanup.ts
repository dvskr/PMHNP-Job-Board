/**
 * One-time legacy duplicate cleanup.
 *
 * Built after the 2026-05-05 prod audit found ~30 dup clusters that
 * accumulated before the new in-memory dedup maps landed (LifeStance 27×,
 * Marlborough 19×, Seasoned Recruitment 15×, etc.).
 *
 * Strategy: cluster published jobs by
 *   (a) `buildJobIdentityKey(title, employer, location)` — the STRONG signal
 *   (b) `buildApplyUrlPathKey(applyLink)` filtered to clusters whose
 *       members ALSO share normalized title+employer (filters out generic
 *       portals like usajobs.gov/Application/Apply where 12 different jobs
 *       share one URL).
 *
 * For each dup cluster, pick a winner (max viewCount+applyClickCount,
 * tiebreak by oldest createdAt) and SOFT-DELETE the others
 * (isPublished=false, archivedAt=now). Soft delete is reversible — a
 * follow-up cleanup can hard-DELETE archived rows after a quarantine.
 *
 * Default is dry-run. Pass `--execute` to actually apply the change.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

const DRY_RUN = !process.argv.includes('--execute');

interface JobRow {
    id: string;
    title: string;
    employer: string;
    location: string;
    applyLink: string | null;
    createdAt: Date;
    originalPostedAt: Date | null;
    viewCount: number;
    applyClickCount: number;
    slug: string | null;
    sourceProvider: string | null;
}

function pickWinner(cluster: JobRow[]): JobRow {
    return cluster.reduce((best, curr) => {
        const bestScore = best.viewCount + best.applyClickCount;
        const currScore = curr.viewCount + curr.applyClickCount;
        if (currScore !== bestScore) return currScore > bestScore ? curr : best;
        return curr.createdAt < best.createdAt ? curr : best;
    });
}

async function main() {
    const { prisma } = await import('@/lib/prisma');
    const { buildJobIdentityKey, buildApplyUrlPathKey, normalizeTitle, normalizeCompany } = await import('@/lib/deduplicator');

    console.log(`\n--- DEDUP CLEANUP (${DRY_RUN ? 'DRY RUN' : 'EXECUTING'}) ---\n`);

    const jobs: JobRow[] = await prisma.job.findMany({
        where: { isPublished: true },
        select: {
            id: true,
            title: true,
            employer: true,
            location: true,
            applyLink: true,
            createdAt: true,
            originalPostedAt: true,
            viewCount: true,
            applyClickCount: true,
            slug: true,
            sourceProvider: true,
        },
    });
    console.log(`Total published jobs: ${jobs.length}`);

    // (a) Title-identity clusters
    const titleClusters = new Map<string, JobRow[]>();
    for (const j of jobs) {
        if (!j.title || !j.employer || !j.location) continue;
        const k = buildJobIdentityKey(j.title, j.employer, j.location);
        if (!titleClusters.has(k)) titleClusters.set(k, []);
        titleClusters.get(k)!.push(j);
    }
    const titleDups = [...titleClusters.entries()].filter(([, c]) => c.length > 1);

    // (b) URL clusters, but only when members share title+employer (filters
    // generic portals where many different jobs share one apply URL).
    const urlClusters = new Map<string, JobRow[]>();
    for (const j of jobs) {
        if (!j.applyLink) continue;
        const k = buildApplyUrlPathKey(j.applyLink);
        if (!k) continue;
        if (!urlClusters.has(k)) urlClusters.set(k, []);
        urlClusters.get(k)!.push(j);
    }
    const urlDups: Array<[string, JobRow[]]> = [];
    for (const [k, cluster] of urlClusters) {
        if (cluster.length < 2) continue;
        const subgroups = new Map<string, JobRow[]>();
        for (const j of cluster) {
            const sub = `${normalizeTitle(j.title)}|${normalizeCompany(j.employer)}`;
            if (!subgroups.has(sub)) subgroups.set(sub, []);
            subgroups.get(sub)!.push(j);
        }
        for (const [sub, group] of subgroups) {
            if (group.length > 1) urlDups.push([`${k} :: ${sub}`, group]);
        }
    }

    // Merge: a job seen in both clustering paths only archives once
    const idsToArchive = new Map<string, string>(); // archivedId -> winnerId
    function processCluster(cluster: JobRow[]) {
        const winner = pickWinner(cluster);
        for (const j of cluster) {
            if (j.id !== winner.id && !idsToArchive.has(j.id)) {
                idsToArchive.set(j.id, winner.id);
            }
        }
    }
    for (const [, c] of titleDups) processCluster(c);
    for (const [, c] of urlDups) processCluster(c);

    console.log(`\nClusters by title-identity: ${titleDups.length}`);
    console.log(`Clusters by apply-URL (title+employer-validated): ${urlDups.length}`);
    console.log(`Unique jobs to archive: ${idsToArchive.size}`);
    console.log(`Jobs that will REMAIN published: ${jobs.length - idsToArchive.size}`);

    // Top 10 largest title-identity clusters
    console.log('\nTop 10 title-identity clusters by size:');
    titleDups
        .sort(([, a], [, b]) => b.length - a.length)
        .slice(0, 10)
        .forEach(([key, c]) => {
            const winner = pickWinner(c);
            console.log(`  ${c.length}× | keep ${winner.id.slice(0, 8)} | ${key.slice(0, 100)}`);
        });

    // Sample of archive-vs-keep decisions
    console.log('\nSample of 8 archive-vs-keep decisions:');
    let n = 0;
    for (const [archiveId, winnerId] of idsToArchive) {
        if (n++ >= 8) break;
        const a = jobs.find((j) => j.id === archiveId)!;
        const w = jobs.find((j) => j.id === winnerId)!;
        console.log(`  ARCHIVE [${a.sourceProvider}] ${a.employer.slice(0, 25)} / ${a.title.slice(0, 40)} / views=${a.viewCount} clicks=${a.applyClickCount}`);
        console.log(`  KEEP→   [${w.sourceProvider}] ${w.employer.slice(0, 25)} / ${w.title.slice(0, 40)} / views=${w.viewCount} clicks=${w.applyClickCount}`);
    }

    // Engagement-loss check: are we archiving any jobs with non-zero clicks?
    const engagedArchives = [...idsToArchive.keys()]
        .map((id) => jobs.find((j) => j.id === id)!)
        .filter((j) => j.applyClickCount > 0);
    if (engagedArchives.length > 0) {
        console.log(`\n⚠️  ${engagedArchives.length} jobs with applyClickCount > 0 are being archived:`);
        engagedArchives.slice(0, 5).forEach((j) => {
            console.log(`  ${j.id} | clicks=${j.applyClickCount} | ${j.employer} / ${j.title.slice(0, 50)}`);
        });
    }

    if (DRY_RUN) {
        console.log('\nDRY RUN — no changes made. Re-run with `--execute` to apply.');
    } else {
        console.log(`\nApplying soft-delete to ${idsToArchive.size} rows...`);
        const result = await prisma.job.updateMany({
            where: { id: { in: [...idsToArchive.keys()] } },
            data: { isPublished: false, archivedAt: new Date() },
        });
        console.log(`✅ Archived ${result.count} rows (isPublished=false, archivedAt=now()).`);
    }

    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
