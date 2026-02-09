/**
 * JSearch-Only Ingestion Script
 * Skips all other sources (Adzuna, Jooble, Lever, Greenhouse, USAJobs, Ashby)
 * and runs only the JSearch hyper-local batch (Top 500 Cities + ~250 Counties).
 * 
 * The deduplicator handles overlap from any partial previous runs.
 * 
 * Usage: npx ts-node -r tsconfig-paths/register scripts/run-jsearch-only.ts
 */

import 'dotenv/config';
import { fetchJSearchJobs } from '../lib/aggregators/jsearch';
import { normalizeJob } from '../lib/job-normalizer';
import { checkDuplicate } from '../lib/deduplicator';
import { prisma } from '../lib/prisma';

async function main() {
    const startTime = Date.now();
    console.log('===========================================');
    console.log('  JSearch-Only Hyper-Scale Ingestion');
    console.log('  90-Day Window | 500 Cities | 250 Counties');
    console.log('===========================================');
    console.log(`  Started: ${new Date().toISOString()}`);
    console.log('');

    let added = 0;
    let duplicates = 0;
    let skipped = 0;
    let errors = 0;

    try {
        // Fetch all JSearch jobs (this runs the full queue internally)
        console.log('[JSearch-Only] Fetching jobs from JSearch...');
        const rawJobs = await fetchJSearchJobs();
        console.log(`[JSearch-Only] Received ${rawJobs.length} raw jobs from JSearch`);

        // Process each job through normalize → dedup → insert
        for (let i = 0; i < rawJobs.length; i++) {
            try {
                const normalized = normalizeJob(rawJobs[i] as any, 'jsearch');

                if (!normalized) {
                    skipped++;
                    continue;
                }

                // Check for duplicates
                const dupCheck = await checkDuplicate({
                    title: (normalized as any).title,
                    employer: (normalized as any).employer,
                    location: (normalized as any).location,
                    externalId: (normalized as any).externalId,
                    sourceProvider: (normalized as any).sourceProvider,
                    applyLink: (normalized as any).applyLink,
                });

                if (dupCheck.isDuplicate) {
                    duplicates++;
                    // Renew if existing job found
                    if (dupCheck.matchedJobId) {
                        await prisma.job.update({
                            where: { id: dupCheck.matchedJobId },
                            data: { updatedAt: new Date(), isPublished: true },
                        });
                    }
                    continue;
                }

                // Insert new job
                await prisma.job.create({
                    data: normalized as any,
                });
                added++;

                // Progress logging every 50 jobs
                if (added % 50 === 0) {
                    console.log(`[JSearch-Only] Progress: ${added} added, ${duplicates} dups, ${skipped} skipped (${i + 1}/${rawJobs.length})`);
                }
            } catch (err) {
                errors++;
                if (errors <= 5) {
                    console.error(`[JSearch-Only] Error processing job ${i}:`, err);
                }
            }
        }
    } catch (err) {
        console.error('[JSearch-Only] Fatal error:', err);
    }

    console.log('');
    console.log('===========================================');
    console.log('  JSearch-Only Ingestion Complete');
    console.log('===========================================');
    console.log(`  Added:      ${added}`);
    console.log(`  Duplicates: ${duplicates}`);
    console.log(`  Skipped:    ${skipped}`);
    console.log(`  Errors:     ${errors}`);
    console.log(`  Finished:   ${new Date().toISOString()}`);
    console.log('===========================================');

    // Final count
    const totalJobs = await prisma.job.count({ where: { isPublished: true } });
    console.log(`\n📊 TOTAL PUBLISHED JOBS IN DB: ${totalJobs}`);

    // Send Discord notification
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (webhookUrl) {
        const duration = Date.now() - startTime;
        const isWarning = added === 0 || errors > added;

        const embed = {
            title: isWarning ? '⚠️ JSearch Local Ingestion Warning' : '✅ JSearch Local Ingestion Complete',
            color: isWarning ? 16776960 : 5763719,
            fields: [
                { name: 'Source', value: 'JSEARCH (Local)', inline: true },
                { name: 'New Jobs', value: String(added), inline: true },
                { name: 'Duplicates', value: String(duplicates), inline: true },
                { name: 'Skipped', value: String(skipped), inline: true },
                { name: 'Errors', value: String(errors), inline: true },
                { name: 'Duration', value: (duration / 1000 / 60).toFixed(1) + ' min', inline: true },
                { name: 'Total Published', value: String(totalJobs), inline: true },
            ],
            timestamp: new Date().toISOString(),
        };

        try {
            await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ embeds: [embed] }),
            });
            console.log('📨 Discord notification sent!');
        } catch (e) {
            console.error('Discord notification failed:', e);
        }
    } else {
        console.log('⚠️ DISCORD_WEBHOOK_URL not set — skipping notification');
    }

    process.exit(0);
}

main().catch(console.error);
