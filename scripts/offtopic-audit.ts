/**
 * OFF-TOPIC JOBS DEEP AUDIT
 * =========================
 * Validates the 1,238 flagged "non-PMHNP" published jobs.
 * Checks title AND description to categorize:
 *   - TRUE off-topic (no PMHNP relevance at all)
 *   - FALSE alarm (description contains PMHNP context)
 *   - Borderline (psych/mental health but not NP-specific)
 */
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config({ path: '.env.prod' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const connString = process.env.PROD_DATABASE_URL;
if (!connString) { console.error('❌ PROD_DATABASE_URL not found'); process.exit(1); }

const pool = new Pool({ connectionString: connString });
const out: string[] = [];
function log(s: string) { out.push(s); console.log(s); }

// The PMHNP title keywords used in the E2E analysis (title-only check)
const TITLE_PMHNP_REGEX = /pmhnp|psychiatric.*nurse|psychiatric.*mental.*health|psych\s*np|psychiatric.*aprn|psychiatric.*arnp|mental\s*health\s*np|psychiatric.*prescriber|psychiatry.*nurse.*practitioner|mental\s*health\s*nurse\s*practitioner|licensed\s*psychiatric/i;

// Broader description-level PMHNP indicators
const DESC_PMHNP_INDICATORS = [
    'pmhnp', 'psychiatric nurse practitioner', 'psychiatric mental health',
    'psych np', 'psychiatric aprn', 'mental health nurse practitioner',
    'pmhnp-bc', 'psychiatric prescriber', 'behavioral health nurse practitioner',
    'psychiatric nurse', 'mental health np', 'psychiatric np',
];

// Strong off-topic indicators (clearly NOT PMHNP roles)
const STRONG_OFFTOPIC = [
    'property manager', 'portfolio manager', 'real estate', 'maintenance',
    'accounting', 'bookkeeper', 'sales manager', 'marketing', 'engineer',
    'software', 'developer', 'designer', 'janitor', 'custodian', 'cook',
    'chef', 'driver', 'security guard', 'receptionist', 'billing',
    'data entry', 'administrative assistant', 'warehouse', 'construction',
    'plumber', 'electrician', 'mechanic', 'librarian', 'teacher',
    'nicu', 'labor and delivery', 'oncology', 'cardiology', 'pediatric',
    'orthopedic', 'dermatology', 'anesthesia', 'surgery', 'surgical',
    'icu nurse', 'er nurse', 'emergency room', 'wound care', 'dialysis',
    'infusion', 'transplant', 'rehabilitation', 'physical therapy',
    'occupational therapy', 'speech therapy', 'dental', 'optometry',
    'ophthalmology', 'radiology', 'licensing lead', 'talent acquisition',
    'recruiting', 'hr manager', 'human resources',
];

async function main() {
    const client = await pool.connect();

    log('🔬 OFF-TOPIC PUBLISHED JOBS — DEEP AUDIT');
    log(`📅 ${new Date().toISOString()}\n`);

    // Fetch ALL published jobs that DON'T match title PMHNP keywords
    const flagged = await client.query(`
    SELECT id, title, employer, source_provider, description, location,
           view_count, apply_click_count, quality_score
    FROM jobs
    WHERE is_published = true
      AND LOWER(title) NOT LIKE '%pmhnp%'
      AND LOWER(title) NOT LIKE '%psychiatric nurse%'
      AND LOWER(title) NOT LIKE '%psychiatric mental health%'
      AND LOWER(title) NOT LIKE '%psych np%'
      AND LOWER(title) NOT LIKE '%psychiatric aprn%'
      AND LOWER(title) NOT LIKE '%psychiatric arnp%'
      AND LOWER(title) NOT LIKE '%mental health np%'
      AND LOWER(title) NOT LIKE '%psychiatric prescriber%'
      AND LOWER(title) NOT LIKE '%psych nurse practitioner%'
      AND LOWER(title) NOT LIKE '%mental health nurse practitioner%'
      AND LOWER(title) NOT LIKE '%psychiatric%nurse%'
      AND LOWER(title) NOT LIKE '%psychiatry nurse practitioner%'
      AND LOWER(title) NOT LIKE '%licensed psychiatric%'
    ORDER BY source_provider, title
  `);

    log(`Total flagged (title doesn't match PMHNP keywords): ${flagged.rows.length}\n`);

    // Categorize each job
    type Category = 'true_offtopic' | 'desc_has_pmhnp' | 'borderline_psych' | 'generic_np';
    const categorized: Record<Category, typeof flagged.rows> = {
        true_offtopic: [],
        desc_has_pmhnp: [],
        borderline_psych: [],
        generic_np: [],
    };

    for (const job of flagged.rows) {
        const titleLower = (job.title || '').toLowerCase();
        const descLower = (job.description || '').toLowerCase();
        const combined = `${titleLower} ${descLower}`;

        // Check if description has PMHNP-specific indicators
        const descHasPMHNP = DESC_PMHNP_INDICATORS.some(kw => descLower.includes(kw));

        // Check if title/desc has general psych/mental health context
        const hasPsychContext = combined.includes('psychiatry') || combined.includes('psychiatric') ||
            combined.includes('mental health') || combined.includes('behavioral health');

        // Check if title has NP/APRN/nurse practitioner
        const titleHasNP = titleLower.includes('nurse practitioner') || titleLower.includes(' np') ||
            titleLower.includes('aprn') || titleLower.includes('arnp') || titleLower.includes('np ');

        // Check for strong off-topic signals in title
        const isStrongOfftopic = STRONG_OFFTOPIC.some(kw => titleLower.includes(kw));

        if (descHasPMHNP) {
            categorized.desc_has_pmhnp.push(job);
        } else if (isStrongOfftopic) {
            categorized.true_offtopic.push(job);
        } else if (titleHasNP && hasPsychContext) {
            categorized.borderline_psych.push(job);
        } else if (titleHasNP && !hasPsychContext) {
            categorized.true_offtopic.push(job);
        } else if (hasPsychContext) {
            categorized.borderline_psych.push(job);
        } else {
            categorized.true_offtopic.push(job);
        }
    }

    // ═══════════════ SUMMARY ═══════════════
    log('═'.repeat(70));
    log('  CATEGORIZATION SUMMARY');
    log('═'.repeat(70));
    log(`  🔴 TRUE OFF-TOPIC (no PMHNP relevance):     ${categorized.true_offtopic.length}`);
    log(`  🟡 BORDERLINE (psych context, not NP title): ${categorized.borderline_psych.length}`);
    log(`  🟢 FALSE ALARM (desc has PMHNP keywords):    ${categorized.desc_has_pmhnp.length}`);
    log(`  Total:                                       ${flagged.rows.length}\n`);

    // ═══════════════ TRUE OFF-TOPIC BY SOURCE ═══════════════
    log('═'.repeat(70));
    log('  🔴 TRUE OFF-TOPIC — BY SOURCE');
    log('═'.repeat(70));
    const offtopicBySource: Record<string, typeof flagged.rows> = {};
    for (const job of categorized.true_offtopic) {
        const src = job.source_provider || 'null';
        if (!offtopicBySource[src]) offtopicBySource[src] = [];
        offtopicBySource[src].push(job);
    }
    for (const [src, jobs] of Object.entries(offtopicBySource).sort((a, b) => b[1].length - a[1].length)) {
        log(`  ${src.padEnd(18)} ${jobs.length} truly off-topic`);
    }

    // ═══════════════ TRUE OFF-TOPIC SAMPLES (30 worst) ═══════════════
    log('\n' + '═'.repeat(70));
    log('  🔴 TRUE OFF-TOPIC — SAMPLE (30 worst, by source)');
    log('═'.repeat(70));
    for (const [src, jobs] of Object.entries(offtopicBySource).sort((a, b) => b[1].length - a[1].length)) {
        const samples = jobs.slice(0, 8);
        log(`\n  ── ${src.toUpperCase()} (${jobs.length} total) ──`);
        for (const j of samples) {
            log(`    ❌ "${j.title}" — ${j.employer} | QS:${j.quality_score} Views:${j.view_count} Clicks:${j.apply_click_count}`);
        }
        if (jobs.length > 8) log(`    ... and ${jobs.length - 8} more`);
    }

    // ═══════════════ BORDERLINE SAMPLES ═══════════════
    log('\n' + '═'.repeat(70));
    log('  🟡 BORDERLINE — SAMPLE (has psych/MH context but not NP title)');
    log('═'.repeat(70));
    const borderlineBySource: Record<string, typeof flagged.rows> = {};
    for (const job of categorized.borderline_psych) {
        const src = job.source_provider || 'null';
        if (!borderlineBySource[src]) borderlineBySource[src] = [];
        borderlineBySource[src].push(job);
    }
    for (const [src, jobs] of Object.entries(borderlineBySource).sort((a, b) => b[1].length - a[1].length)) {
        const samples = jobs.slice(0, 5);
        log(`\n  ── ${src.toUpperCase()} (${jobs.length} total) ──`);
        for (const j of samples) {
            log(`    ⚠️ "${j.title}" — ${j.employer} | QS:${j.quality_score}`);
        }
    }

    // ═══════════════ FALSE ALARMS ═══════════════
    log('\n' + '═'.repeat(70));
    log('  🟢 FALSE ALARMS — SAMPLE (desc mentions PMHNP, title doesn\'t)');
    log('═'.repeat(70));
    const falseAlarmBySource: Record<string, typeof flagged.rows> = {};
    for (const job of categorized.desc_has_pmhnp) {
        const src = job.source_provider || 'null';
        if (!falseAlarmBySource[src]) falseAlarmBySource[src] = [];
        falseAlarmBySource[src].push(job);
    }
    for (const [src, jobs] of Object.entries(falseAlarmBySource).sort((a, b) => b[1].length - a[1].length)) {
        const samples = jobs.slice(0, 5);
        log(`\n  ── ${src.toUpperCase()} (${jobs.length} total) ──`);
        for (const j of samples) {
            log(`    ✅ "${j.title}" — ${j.employer} | QS:${j.quality_score}`);
        }
    }

    // ═══════════════ ENGAGEMENT ON OFF-TOPIC JOBS ═══════════════
    log('\n' + '═'.repeat(70));
    log('  📊 ENGAGEMENT ON OFF-TOPIC JOBS');
    log('═'.repeat(70));
    const totalViews = categorized.true_offtopic.reduce((sum, j) => sum + (parseInt(j.view_count) || 0), 0);
    const totalClicks = categorized.true_offtopic.reduce((sum, j) => sum + (parseInt(j.apply_click_count) || 0), 0);
    log(`  Total views on truly off-topic:    ${totalViews.toLocaleString()}`);
    log(`  Total clicks on truly off-topic:   ${totalClicks}`);
    log(`  Wasted CTR budget:                 ${totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(2) : 0}%`);

    // ═══════════════ TITLE WORD FREQUENCY (off-topic) ═══════════════
    log('\n' + '═'.repeat(70));
    log('  📈 MOST COMMON WORDS IN OFF-TOPIC TITLES');
    log('═'.repeat(70));
    const wordFreq: Record<string, number> = {};
    const stopWords = new Set(['a', 'an', 'the', 'and', 'or', 'in', 'at', 'of', 'to', 'for', '-', '–', '—', '/', '|', ',', '(', ')', '*']);
    for (const job of categorized.true_offtopic) {
        const words = (job.title || '').toLowerCase().split(/\s+/).filter((w: string) => w.length > 2 && !stopWords.has(w));
        for (const w of words) {
            wordFreq[w] = (wordFreq[w] || 0) + 1;
        }
    }
    const topWords = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]).slice(0, 30);
    for (const [word, count] of topWords) {
        log(`  ${String(count).padStart(5)}x  ${word}`);
    }

    // ═══════════════ RECOMMENDATION ═══════════════
    log('\n' + '═'.repeat(70));
    log('  💡 RECOMMENDATION');
    log('═'.repeat(70));
    log(`  ${categorized.true_offtopic.length} truly off-topic published jobs should be unpublished.`);
    log(`  ${categorized.borderline_psych.length} borderline jobs need manual review.`);
    log(`  ${categorized.desc_has_pmhnp.length} false alarms are actually PMHNP-relevant (description has PMHNP keywords).`);

    client.release();
    await pool.end();

    const reportPath = 'scripts/offtopic-audit-report.txt';
    fs.writeFileSync(reportPath, out.join('\n'), 'utf8');
    console.log(`\n📄 Report saved: ${reportPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
