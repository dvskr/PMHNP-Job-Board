/**
 * Phase 4 Backfill Script
 * 
 * One-time script to backfill missing data for published jobs:
 * 1. Salary extraction from descriptions (for jobs with null salary)
 * 2. Job type detection from title+description (for jobs with null jobType)
 * 3. Description summary improvement (smart extraction instead of dumb truncation)
 * 
 * Usage: npx tsx scripts/backfill-data.ts [--dry-run]
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.prod' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const DRY_RUN = process.argv.includes('--dry-run');
const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL });

// ── Salary Extraction (copied from job-normalizer.ts) ──
function extractSalary(text: string): { min: number | null; max: number | null; period: string | null } {
    function parseDollar(s: string): number {
        const cleaned = s.replace(/,/g, '').trim();
        if (/k$/i.test(cleaned)) return parseFloat(cleaned.replace(/k$/i, '')) * 1000;
        return parseFloat(cleaned);
    }
    const sep = '(?:\\s*[-–—]\\s*|\\s+to\\s+|\\s+through\\s+)';
    const amt = '\\$([\\d,]+(?:\\.\\d{1,2})?(?:k)?)';

    // 1. Hourly
    let match = new RegExp(amt + '(?:' + sep + '\\$?([\\d,]+(?:\\.\\d{1,2})?(?:k)?))?\\s*(?:per\\s*hour|per\\s*hr|\\/\\s*(?:hour|hr)|hourly)', 'gi').exec(text);
    if (match) return { min: parseDollar(match[1]), max: match[2] ? parseDollar(match[2]) : null, period: 'hour' };

    // 2. Annual
    match = new RegExp(amt + '(?:' + sep + '\\$?([\\d,]+(?:\\.\\d{1,2})?(?:k)?))?\\s*(?:per\\s*year|\\/\\s*(?:year|yr)|annual(?:ly)?|yearly|per\\s*annum)', 'gi').exec(text);
    if (match) return { min: parseDollar(match[1]), max: match[2] ? parseDollar(match[2]) : null, period: 'year' };

    // 3. Monthly
    match = new RegExp(amt + '(?:' + sep + '\\$?([\\d,]+(?:\\.\\d{1,2})?(?:k)?))?\\s*(?:per\\s*month|\\/\\s*(?:month|mo)|monthly)', 'gi').exec(text);
    if (match) return { min: parseDollar(match[1]), max: match[2] ? parseDollar(match[2]) : null, period: 'month' };

    // 4. Salary context
    match = new RegExp('(?:salary|compensation|pay|earning|wage|rate)\\s*(?:range|of|is|:)?\\s*(?:up\\s+to\\s+)?' + amt + '(?:' + sep + '\\$?([\\d,]+(?:\\.\\d{1,2})?(?:k)?))?', 'gi').exec(text);
    if (match) {
        const min = parseDollar(match[1]);
        const max = match[2] ? parseDollar(match[2]) : null;
        const period = min > 500 ? 'year' : 'hour';
        return { min, max, period };
    }

    // 5. Generic range
    match = new RegExp(amt + sep + '\\$?([\\d,]+(?:\\.\\d{1,2})?(?:k)?)', 'gi').exec(text);
    if (match) {
        const min = parseDollar(match[1]);
        const max = parseDollar(match[2]);
        const context = text.substring(Math.max(0, (match.index || 0) - 50), (match.index || 0) + match[0].length + 50).toLowerCase();
        const isFalsePositive = context.includes('funding') || context.includes('raised') || context.includes('series') ||
            context.includes('deductible') || context.includes('malpractice') || context.includes('insurance') ||
            context.includes('sign-on') || context.includes('sign on') || context.includes('bonus') ||
            context.includes('revenue') || context.includes('investment');
        if (!isFalsePositive) {
            if (min >= 15 && min <= 200 && max >= 15 && max <= 500) return { min, max, period: 'hour' };
            if (min >= 20000) return { min, max, period: 'year' };
        }
    }
    return { min: null, max: null, period: null };
}

// ── Salary Normalization ──
function normalizeSalaryToAnnual(min: number | null, max: number | null, period: string | null): { normalizedMin: number | null; normalizedMax: number | null } {
    if (!min && !max) return { normalizedMin: null, normalizedMax: null };
    const multipliers: Record<string, number> = { hour: 2080, day: 260, week: 52, biweekly: 26, month: 12, year: 1 };
    const mult = multipliers[period || 'year'] || 1;
    return {
        normalizedMin: min ? Math.round(min * mult) : null,
        normalizedMax: max ? Math.round(max * mult) : null,
    };
}

// ── Job Type Detection (copied from job-normalizer.ts) ──
function detectJobType(text: string): string | null {
    const t = text.toLowerCase();
    if (t.includes('per diem') || t.includes('per-diem')) return 'Per Diem';
    if (t.includes('contract') || t.includes('contractor')) return 'Contract';
    if (t.includes('part-time') || t.includes('part time')) return 'Part-Time';
    if (t.includes('full-time') || t.includes('full time') || t.includes('permanent')) return 'Full-Time';
    return null;
}

// ── Smart Description Summary ──
function generateSmartSummary(description: string, maxLen: number = 300): string {
    if (!description) return '';
    // Strip HTML tags
    let text = description
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();

    // Skip boilerplate intro patterns
    const boilerplatePatterns = [
        /^(about\s+(us|the\s+company|our\s+company|the\s+organization)[:.]?\s*)/i,
        /^(company\s+(overview|description|summary)[:.]?\s*)/i,
        /^(who\s+we\s+are[:.]?\s*)/i,
    ];
    for (const p of boilerplatePatterns) {
        const match = p.exec(text);
        if (match) {
            // Find the end of the boilerplate paragraph
            const afterBoilerplate = text.indexOf('. ', match[0].length);
            if (afterBoilerplate > 0 && afterBoilerplate < 500) {
                text = text.substring(afterBoilerplate + 2).trim();
            }
        }
    }

    // Find the most informative section (role/position/opportunity)
    const roleSectionPatterns = [
        /(?:about\s+the\s+(?:role|position|opportunity|job))[:.]?\s*/i,
        /(?:position\s+(?:overview|summary|description))[:.]?\s*/i,
        /(?:role\s+(?:overview|summary|description))[:.]?\s*/i,
        /(?:job\s+(?:overview|summary|description))[:.]?\s*/i,
        /(?:we\s+are\s+(?:looking|seeking|hiring))[:.]?\s*/i,
    ];
    for (const p of roleSectionPatterns) {
        const match = p.exec(text);
        if (match && match.index !== undefined) {
            text = text.substring(match.index + match[0].length).trim();
            break;
        }
    }

    // Truncate to maxLen at a sentence boundary
    if (text.length <= maxLen) return text;
    const truncated = text.substring(0, maxLen);
    const lastSentence = truncated.lastIndexOf('. ');
    if (lastSentence > maxLen * 0.5) {
        return truncated.substring(0, lastSentence + 1).trim();
    }
    const lastSpace = truncated.lastIndexOf(' ');
    return truncated.substring(0, lastSpace > 0 ? lastSpace : maxLen).trim() + '...';
}

// ── Display Salary Formatter ──
function formatDisplaySalary(min: number | null, max: number | null, period: string | null): string | null {
    if (!min && !max) return null;
    const fmt = (n: number) => n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`;
    if (min && max) return `${fmt(min)} - ${fmt(max)}/${period || 'year'}`;
    if (min) return `${fmt(min)}+/${period || 'year'}`;
    if (max) return `Up to ${fmt(max)}/${period || 'year'}`;
    return null;
}

async function main() {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`PHASE 4 DATA BACKFILL ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'}`);
    console.log(`${'='.repeat(70)}\n`);

    // ── 1. Salary Backfill ──
    console.log('--- SALARY BACKFILL ---');
    const salaryJobs = await pool.query(`
    SELECT id, title, description
    FROM jobs
    WHERE is_published = true
    AND normalized_min_salary IS NULL
    AND normalized_max_salary IS NULL
    AND description IS NOT NULL
    AND LENGTH(description) > 100
  `);
    console.log(`Found ${salaryJobs.rowCount} jobs missing salary with descriptions to scan`);

    let salaryBackfilled = 0;
    for (const job of salaryJobs.rows) {
        const salary = extractSalary(job.description);
        if (salary.min || salary.max) {
            const { normalizedMin, normalizedMax } = normalizeSalaryToAnnual(salary.min, salary.max, salary.period);
            // Validate reasonable ranges
            if (normalizedMin && (normalizedMin < 20000 || normalizedMin > 500000)) continue;
            if (normalizedMax && (normalizedMax < 20000 || normalizedMax > 500000)) continue;
            const displaySalary = formatDisplaySalary(normalizedMin, normalizedMax, 'year');
            if (!DRY_RUN) {
                await pool.query(`
          UPDATE jobs SET
            min_salary = $1, max_salary = $2, salary_period = $3,
            normalized_min_salary = $4, normalized_max_salary = $5,
            display_salary = $6, salary_is_estimated = true,
            salary_confidence = 0.3, updated_at = NOW()
          WHERE id = $7
        `, [salary.min ? Math.round(salary.min) : null, salary.max ? Math.round(salary.max) : null, salary.period, normalizedMin, normalizedMax, displaySalary, job.id]);
            }
            salaryBackfilled++;
            if (salaryBackfilled <= 5) {
                console.log(`  ✅ ${job.title}: ${displaySalary}`);
            }
        }
    }
    console.log(`Salary backfilled: ${salaryBackfilled}/${salaryJobs.rowCount}`);

    // ── 2. Job Type Backfill ──
    console.log('\n--- JOB TYPE BACKFILL ---');
    const typeJobs = await pool.query(`
    SELECT id, title, description
    FROM jobs
    WHERE is_published = true
    AND job_type IS NULL
    AND (description IS NOT NULL OR title IS NOT NULL)
  `);
    console.log(`Found ${typeJobs.rowCount} jobs missing job type`);

    let typeBackfilled = 0;
    for (const job of typeJobs.rows) {
        const combined = `${job.title || ''} ${job.description || ''}`;
        const jobType = detectJobType(combined);
        if (jobType) {
            if (!DRY_RUN) {
                await pool.query(`UPDATE jobs SET job_type = $1, updated_at = NOW() WHERE id = $2`, [jobType, job.id]);
            }
            typeBackfilled++;
            if (typeBackfilled <= 5) {
                console.log(`  ✅ ${job.title}: ${jobType}`);
            }
        }
    }
    console.log(`Job type backfilled: ${typeBackfilled}/${typeJobs.rowCount}`);

    // ── 3. Description Summary Improvement ──
    console.log('\n--- DESCRIPTION SUMMARY IMPROVEMENT ---');
    const summaryJobs = await pool.query(`
    SELECT id, title, description, description_summary
    FROM jobs
    WHERE is_published = true
    AND description IS NOT NULL
    AND LENGTH(description) > 100
    AND (
      description_summary IS NULL
      OR LENGTH(description_summary) < 50
      OR description_summary LIKE '<%'
    )
  `);
    console.log(`Found ${summaryJobs.rowCount} jobs needing summary improvement`);

    let summaryImproved = 0;
    for (const job of summaryJobs.rows) {
        const newSummary = generateSmartSummary(job.description);
        if (newSummary && newSummary.length > 50) {
            if (!DRY_RUN) {
                await pool.query(`UPDATE jobs SET description_summary = $1, updated_at = NOW() WHERE id = $2`, [newSummary, job.id]);
            }
            summaryImproved++;
            if (summaryImproved <= 3) {
                console.log(`  ✅ ${job.title}: "${newSummary.substring(0, 80)}..."`);
            }
        }
    }
    console.log(`Summaries improved: ${summaryImproved}/${summaryJobs.rowCount}`);

    // ── Summary ──
    console.log(`\n${'='.repeat(70)}`);
    console.log(`BACKFILL COMPLETE ${DRY_RUN ? '(DRY RUN - no changes made)' : ''}`);
    console.log(`  Salary:      ${salaryBackfilled} jobs backfilled`);
    console.log(`  Job Type:    ${typeBackfilled} jobs backfilled`);
    console.log(`  Summaries:   ${summaryImproved} jobs improved`);
    console.log(`${'='.repeat(70)}\n`);

    await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
