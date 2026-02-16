/**
 * Audit script: Tests all Greenhouse and Lever companies for active PMHNP jobs
 * and checks if they have been posted in the last 30 days.
 */

import { isRelevantJob } from '../lib/utils/job-filter';

const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ─── GREENHOUSE COMPANIES ──────────────────────────────────────────

const EXISTING_GREENHOUSE = [
    'sondermind', 'headway', 'modernhealth', 'mantrahealth', 'cerebral', 'twochairs',
    'talkspace', 'ayahealthcare', 'amwell', 'octave', 'growtherapy',
    'blueskytelepsych', 'bicyclehealth', 'signifyhealth', 'valerahealth',
    'charliehealth', 'blackbirdhealth', 'ophelia',
    'springhealth66', 'omadahealth', 'brave',
];

const NEW_GREENHOUSE_CANDIDATES = [
    // Telehealth / Mental Health
    'raborhealth', 'noomhealth', 'noom', 'gaborhealth',
    'betterhelp', 'regaincouplescounseling',
    'firsthand1', 'firsthand', 'equip',
    'mindbloom', 'mindbloomhealth',
    'grouportx', 'grouportherapeutics',
    'doneofficially', 'done',
    'pathmentalhealth', 'pathlight',
    'cerebral', 'risingground',
    'alma', 'helloalma',
    'compassionate',
    'elemy', 'corticacare', 'cortica',
    'clarityclinic',
    'forhims', 'hims',
    'wayspring', 'wayspringhealth',
    'monument', 'joinmonument',
    'milestonepsych', 'milestones',
    'geode', 'geodehealth',
    'innerwell',
    'donesfirst', 'dontforgetme',
    'blueprint', 'blueprinthealth',
    'clearstep', 'clearstephealth',
    'pinnacletreatment', 'pinnacletreatmentcenters',
    'greenleafcounseling',
    'sunstone', 'sunstonecounseling',
    'refreshmentalhealth', 'refresh',
    'compassion', 'compasspathways',
    'tavahealth', 'tava',
    'ozonehealth', 'ozone',
    'huggingface',
    'luminhealth', 'lumin',
    'rivianhealth',
    'trusst',
    'brightline', 'brightlinehealth',
    'galileo', 'galileohealth',
    'pear', 'peartherapeutics',
    'quartet', 'quartethealth',
    'healthie', 'gethealthie',
    'wheel', 'wheelhealth',
    'abcalliance', 'aptihealth',
    'amaehealth',
    'claritycgm',
    'pelago', 'pelagohealth',
    'nuelife', 'nuelifehealth',
    'genomind',
    'lighthousegabor',
];

async function auditGreenhouse() {
    console.log('═══════════════════════════════════════════');
    console.log(' GREENHOUSE AUDIT');
    console.log('═══════════════════════════════════════════\n');

    const allSlugs = [...new Set([...EXISTING_GREENHOUSE, ...NEW_GREENHOUSE_CANDIDATES])];
    const results: Array<{ slug: string; status: string; total: number; pmhnp: number; recent: number; isNew: boolean }> = [];

    for (const slug of allSlugs) {
        try {
            const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`;
            const r = await fetch(url);

            if (!r.ok) {
                results.push({ slug, status: `HTTP ${r.status}`, total: 0, pmhnp: 0, recent: 0, isNew: !EXISTING_GREENHOUSE.includes(slug) });
                continue;
            }

            const data = await r.json();
            const jobs = data.jobs || [];
            const total = jobs.length;

            // Filter for PMHNP relevance
            const pmhnpJobs = jobs.filter((j: any) => isRelevantJob(j.title || '', j.content || ''));

            // Check recency (last 30 days)
            const recentPmhnp = pmhnpJobs.filter((j: any) => {
                const updated = new Date(j.updated_at);
                return updated >= THIRTY_DAYS_AGO;
            });

            results.push({
                slug,
                status: 'OK',
                total,
                pmhnp: pmhnpJobs.length,
                recent: recentPmhnp.length,
                isNew: !EXISTING_GREENHOUSE.includes(slug),
            });

            if (pmhnpJobs.length > 0) {
                console.log(`✅ ${slug}: ${total} total, ${pmhnpJobs.length} PMHNP, ${recentPmhnp.length} recent`);
            } else if (total > 0) {
                process.stdout.write(`⬜ ${slug}: ${total} total, 0 PMHNP\n`);
            }

            await sleep(300);
        } catch {
            results.push({ slug, status: 'ERR', total: 0, pmhnp: 0, recent: 0, isNew: !EXISTING_GREENHOUSE.includes(slug) });
        }
    }

    // Summary
    console.log('\n── GREENHOUSE SUMMARY ──────────────────────');

    const active = results.filter(r => r.pmhnp > 0 && r.recent > 0);
    const stale = results.filter(r => r.pmhnp > 0 && r.recent === 0);
    const monitoring = results.filter(r => r.status === 'OK' && r.total > 0 && r.pmhnp === 0);
    const dead = results.filter(r => r.status !== 'OK');

    console.log(`\n🟢 ACTIVE (PMHNP + recent 30d):`);
    active.forEach(r => console.log(`  ${r.isNew ? '🆕' : '  '} ${r.slug}: ${r.pmhnp} PMHNP (${r.recent} recent)`));

    console.log(`\n🟡 STALE (PMHNP but none recent):`);
    stale.forEach(r => console.log(`  ${r.isNew ? '🆕' : '  '} ${r.slug}: ${r.pmhnp} PMHNP (0 recent)`));

    console.log(`\n⬜ MONITORING (valid but 0 PMHNP):`);
    monitoring.forEach(r => console.log(`  ${r.isNew ? '🆕' : '  '} ${r.slug}: ${r.total} total jobs`));

    console.log(`\n❌ DEAD/404:`);
    dead.forEach(r => console.log(`  ${r.isNew ? '🆕' : '  '} ${r.slug}: ${r.status}`));

    return results;
}

// ─── LEVER COMPANIES ──────────────────────────────────────────

const EXISTING_LEVER = [
    'lifestance', 'talkiatry', 'includedhealth', 'lyrahealth', 'carbonhealth',
];

const NEW_LEVER_CANDIDATES = [
    'cerebral', 'equip', 'noomhealth', 'alma',
    'blueprint', 'brightline', 'grouportx',
    'galileo', 'compasspathways', 'mindbloom',
    'innerwell', 'nuelife', 'pelago',
    'quartet', 'aptihealth', 'genomind',
    'tavahealth', 'geodehealth', 'wayspring',
    'firsthand', 'pathlight', 'rula', 'rulahealth',
    'refreshmentalhealth',
    'clarityclinic', 'pinnacletreatment',
    'donefirst', 'doneofficially',
    'milestonepsych', 'sunstone',
    'ozonehealth', 'prosper',
    'cortica', 'wheelhealth',
    'amaehealth', 'peartherapeutics',
    'gethealthie', 'clearstep',
];

async function auditLever() {
    console.log('\n\n═══════════════════════════════════════════');
    console.log(' LEVER AUDIT');
    console.log('═══════════════════════════════════════════\n');

    const allSlugs = [...new Set([...EXISTING_LEVER, ...NEW_LEVER_CANDIDATES])];
    const results: Array<{ slug: string; status: string; total: number; pmhnp: number; recent: number; isNew: boolean }> = [];

    for (const slug of allSlugs) {
        try {
            const url = `https://api.lever.co/v0/postings/${slug}`;
            const r = await fetch(url);

            if (!r.ok) {
                results.push({ slug, status: `HTTP ${r.status}`, total: 0, pmhnp: 0, recent: 0, isNew: !EXISTING_LEVER.includes(slug) });
                continue;
            }

            const postings = await r.json();
            const total = postings.length;

            const pmhnpJobs = postings.filter((p: any) => {
                const desc = [p.descriptionPlain, p.description, ...(p.lists?.map((l: any) => l.content) || [])].join(' ');
                return isRelevantJob(p.text || '', desc);
            });

            const recentPmhnp = pmhnpJobs.filter((p: any) => {
                const created = new Date(p.createdAt);
                return created >= THIRTY_DAYS_AGO;
            });

            results.push({
                slug,
                status: 'OK',
                total,
                pmhnp: pmhnpJobs.length,
                recent: recentPmhnp.length,
                isNew: !EXISTING_LEVER.includes(slug),
            });

            if (pmhnpJobs.length > 0) {
                console.log(`✅ ${slug}: ${total} total, ${pmhnpJobs.length} PMHNP, ${recentPmhnp.length} recent`);
            } else if (total > 0) {
                process.stdout.write(`⬜ ${slug}: ${total} total, 0 PMHNP\n`);
            }

            await sleep(300);
        } catch {
            results.push({ slug, status: 'ERR', total: 0, pmhnp: 0, recent: 0, isNew: !EXISTING_LEVER.includes(slug) });
        }
    }

    // Summary
    console.log('\n── LEVER SUMMARY ──────────────────────');

    const active = results.filter(r => r.pmhnp > 0 && r.recent > 0);
    const stale = results.filter(r => r.pmhnp > 0 && r.recent === 0);
    const monitoring = results.filter(r => r.status === 'OK' && r.total > 0 && r.pmhnp === 0);
    const dead = results.filter(r => r.status !== 'OK');

    console.log(`\n🟢 ACTIVE (PMHNP + recent 30d):`);
    active.forEach(r => console.log(`  ${r.isNew ? '🆕' : '  '} ${r.slug}: ${r.pmhnp} PMHNP (${r.recent} recent)`));

    console.log(`\n🟡 STALE (PMHNP but none recent):`);
    stale.forEach(r => console.log(`  ${r.isNew ? '🆕' : '  '} ${r.slug}: ${r.pmhnp} PMHNP (0 recent)`));

    console.log(`\n⬜ MONITORING (valid but 0 PMHNP):`);
    monitoring.forEach(r => console.log(`  ${r.isNew ? '🆕' : '  '} ${r.slug}: ${r.total} total jobs`));

    console.log(`\n❌ DEAD/404:`);
    dead.forEach(r => console.log(`  ${r.isNew ? '🆕' : '  '} ${r.slug}: ${r.status}`));
}

// ─── MAIN ──────────────────────────────────────────

async function main() {
    await auditGreenhouse();
    await auditLever();
    console.log('\n\n✅ AUDIT COMPLETE');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
