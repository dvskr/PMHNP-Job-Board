/**
 * One-shot script: insert <CategoryLocationsExplore> into every category
 * landing page that doesn't already have it.
 *
 * Idempotent — running again is a no-op for already-edited files.
 *
 * For each category dir under app/jobs/:
 *   1. Add the import line if missing (placed after the last component import).
 *   2. Insert the component just before the first FAQ-related marker:
 *        - <CategoryFAQ ...
 *        - {/* ═══ FAQ ═══ */
//       - {/* FAQ Section */} or similar
import * as fs from 'fs';
import * as path from 'path';

const JOBS_DIR = path.join(process.cwd(), 'app', 'jobs');

// Categories that have their own landing page AND state/city pseoStats.
// Skip ones already manually edited.
const SLUG_TO_LABEL: Record<string, string> = {
    '1099': '1099',
    addiction: 'Addiction',
    'child-adolescent': 'Child & Adolescent',
    'community-health': 'Community Health',
    correctional: 'Correctional',
    crisis: 'Crisis',
    'entry-level': 'Entry-Level',
    geriatric: 'Geriatric',
    hospital: 'Hospital',
    inpatient: 'Inpatient',
    lgbtq: 'LGBTQ+',
    'locum-tenens': 'Locum Tenens',
    'mid-career': 'Mid-Career',
    outpatient: 'Outpatient',
    'part-time': 'Part-Time',
    'per-diem': 'Per Diem',
    'private-practice': 'Private Practice',
    senior: 'Senior',
    'substance-abuse': 'Substance Abuse',
    telehealth: 'Telehealth',
    travel: 'Travel',
    va: 'VA',
    veterans: 'Veterans',
};

const IMPORT_LINE = `import CategoryLocationsExplore from '@/components/seo/CategoryLocationsExplore';`;

function patchFile(slug: string, label: string): 'added' | 'skipped' | 'no-faq' | 'no-import-anchor' {
    const file = path.join(JOBS_DIR, slug, 'page.tsx');
    if (!fs.existsSync(file)) return 'skipped';

    let src = fs.readFileSync(file, 'utf8');

    // Already patched?
    if (src.includes('CategoryLocationsExplore')) return 'skipped';

    // 1. Insert import after the last `import ... from '@/components/...';` line
    const importRegex = /^(import .* from ['"]@\/components\/[^'"]+['"];?)$/gm;
    let lastImportEnd = -1;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(src)) !== null) {
        lastImportEnd = match.index + match[0].length;
    }
    if (lastImportEnd === -1) return 'no-import-anchor';
    src = src.slice(0, lastImportEnd) + '\n' + IMPORT_LINE + src.slice(lastImportEnd);

    // 2. Insert <CategoryLocationsExplore /> just before the first FAQ marker.
    // Try multiple FAQ anchors in priority order; only the first match matters.
    // Falls back to EXPLORE MORE section for pages with no FAQ block.
    const faqAnchors: RegExp[] = [
        /\n(\s*)\{\/\*\s*═+\s*\d*\.?\s*FAQ[^*]*\*\/\}/i,             // {/* ═══ N. FAQ ═══ */}
        /\n(\s*)\{\/\*\s*-+\s*FAQ\s*-+\s*\*\/\}/i,                    // {/* --- FAQ --- */}
        /\n(\s*)\{\/\*\s*\d+\.\s*FAQ\s*\*\/\}/i,                      // {/* 6. FAQ */}
        /\n(\s*)\{\/\*\s*FAQ[^*]*\*\/\}/i,                            // {/* FAQ ... */}
        /\n(\s*)<CategoryFAQ\b/,                                       // <CategoryFAQ ...
        /\n(\s*)\{\/\*\s*═+\s*EXPLORE\s+MORE\s*═+\s*\*\/\}/i,         // fallback: {/* ═══ EXPLORE MORE ═══ */}
        /\n(\s*)\{\/\*\s*-+\s*EXPLORE\s+MORE\s*-+\s*\*\/\}/i,         // fallback: {/* --- EXPLORE MORE --- */}
    ];

    let inserted = false;
    for (const re of faqAnchors) {
        const m = re.exec(src);
        if (!m) continue;
        const indent = m[1] || '      ';
        const insertion =
            `\n${indent}{/* By Location — pseoStats-gated internal links */}\n` +
            `${indent}<CategoryLocationsExplore categorySlug="${slug}" categoryLabel="${label}" />\n`;
        src = src.slice(0, m.index) + insertion + src.slice(m.index);
        inserted = true;
        break;
    }
    if (!inserted) return 'no-faq';

    fs.writeFileSync(file, src, 'utf8');
    return 'added';
}

let added = 0, skipped = 0, failed: string[] = [];
for (const [slug, label] of Object.entries(SLUG_TO_LABEL)) {
    const result = patchFile(slug, label);
    if (result === 'added') {
        added++;
        console.log(`  ✓ ${slug}`);
    } else if (result === 'skipped') {
        skipped++;
        console.log(`  · ${slug} (already patched or missing)`);
    } else {
        failed.push(`${slug} (${result})`);
        console.log(`  ✗ ${slug} (${result})`);
    }
}

console.log(`\nadded=${added}  skipped=${skipped}  failed=${failed.length}`);
if (failed.length) {
    console.log('Failed:', failed.join(', '));
    process.exit(1);
}
