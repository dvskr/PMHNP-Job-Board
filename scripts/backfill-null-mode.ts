/**
 * One-shot mode-only backfill for already-enriched null-mode jobs from
 * still-active sources. The regular enrich-jobs cron skips already-enriched
 * jobs by design (avoids re-spending tokens), so jobs that the OLD prompt
 * couldn't extract a canonical mode for never get a second chance.
 *
 * This script targets a focused subset:
 *   - isPublished=true
 *   - mode IS NULL
 *   - lastEnrichedAt IS NOT NULL  (already-touched, won't retry naturally)
 *   - sourceProvider IN active sources (skip jooble/jsearch — aging out)
 *
 * Calls the LLM with the SAME canonical prompt that the cron uses today
 * (after the 2026-04-30 tightening) and writes only the mode field.
 *
 * Usage:
 *   Dry run:   npx ts-node ... scripts/backfill-null-mode.ts
 *   Apply:     npx ts-node ... scripts/backfill-null-mode.ts --apply
 *
 * Cost:        ~538 calls × ~1k input tokens × $0.15/1M ≈ $0.10
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';
import OpenAI from 'openai';

const APPLY = process.argv.includes('--apply');
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 200;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ACTIVE_SOURCES = ['adzuna', 'greenhouse', 'lever', 'workday', 'ats-jobs-db', 'fantastic-jobs-db', 'smartrecruiters'];

const SYSTEM_PROMPT = `You extract the work-mode of a job posting. Return JSON: { "work_mode": "Remote" | "Hybrid" | "In-Person" | null }.

Rules:
- "Remote" — fully remote, work-from-home, or telehealth
- "Hybrid" — explicitly mentions a mix of remote + on-site
- "In-Person" — fully on-site, in-clinic, in-person
- null — no clear signal in the description

NEVER use "On-site", "Onsite", or "Telehealth". Map them: Telehealth → Remote, On-site/Onsite → In-Person. Never guess if the description doesn't mention any of these concepts.`;

function canonicalize(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const t = raw.trim();
    if (t === 'Telehealth') return 'Remote';
    if (t === 'On-site' || t === 'Onsite') return 'In-Person';
    if (t === 'Remote' || t === 'Hybrid' || t === 'In-Person') return t;
    return null;
}

async function extractMode(title: string, description: string): Promise<string | null> {
    try {
        const res = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: `Title: ${title}\n\nDescription:\n${description.slice(0, 4000)}` },
            ],
            temperature: 0,
        });
        const content = res.choices[0]?.message?.content ?? '{}';
        const json = JSON.parse(content);
        return canonicalize(json.work_mode);
    } catch {
        return null;
    }
}

async function main(): Promise<void> {
    const candidates = await prisma.job.findMany({
        where: {
            isPublished: true,
            mode: null,
            lastEnrichedAt: { not: null },
            description: { not: '' },
            sourceProvider: { in: ACTIVE_SOURCES },
        },
        select: { id: true, title: true, description: true, sourceProvider: true },
    });

    console.log(`${APPLY ? '🟢 APPLY' : '🔍 DRY-RUN'}  ·  candidates: ${candidates.length}\n`);

    const results = { extracted: 0, stillNull: 0, errors: 0, byMode: { Remote: 0, Hybrid: 0, 'In-Person': 0 } as Record<string, number> };

    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
        const batch = candidates.slice(i, i + BATCH_SIZE);
        const out = await Promise.allSettled(
            batch.map(async (job) => {
                const mode = await extractMode(job.title, job.description);
                return { job, mode };
            }),
        );
        for (const r of out) {
            if (r.status !== 'fulfilled') { results.errors++; continue; }
            const { job, mode } = r.value;
            if (!mode) { results.stillNull++; continue; }
            results.extracted++;
            results.byMode[mode] = (results.byMode[mode] ?? 0) + 1;
            if (APPLY) {
                await prisma.job.update({
                    where: { id: job.id },
                    data: {
                        mode,
                        ...(mode === 'Remote' ? { isRemote: true } : {}),
                        ...(mode === 'Hybrid' ? { isHybrid: true } : {}),
                    },
                });
            }
        }
        if ((i + BATCH_SIZE) % 50 === 0) {
            console.log(`  ${Math.min(i + BATCH_SIZE, candidates.length)}/${candidates.length}  extracted=${results.extracted}  null=${results.stillNull}  err=${results.errors}`);
        }
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }

    console.log();
    console.log(`Total processed: ${candidates.length}`);
    console.log(`  extracted:  ${results.extracted}  (${((results.extracted / candidates.length) * 100).toFixed(1)}%)`);
    console.log(`  still null: ${results.stillNull}`);
    console.log(`  errors:     ${results.errors}`);
    console.log(`  by mode:    Remote=${results.byMode.Remote || 0}  Hybrid=${results.byMode.Hybrid || 0}  In-Person=${results.byMode['In-Person'] || 0}`);
    if (!APPLY && results.extracted > 0) console.log('\n  Re-run with --apply to commit.');

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('Backfill failed:', err);
    await prisma.$disconnect();
    process.exit(1);
});
