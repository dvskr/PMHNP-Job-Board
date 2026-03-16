#!/usr/bin/env node
/**
 * seed-youtube-videos.mjs
 * ────────────────────────────────────────────────────────────────────
 * Populates the youtube_videos table with all 50 states' metadata.
 * Run once to seed, idempotent (upserts by state_key).
 *
 * Usage:
 *   node scripts/seed-youtube-videos.mjs
 *   node scripts/seed-youtube-videos.mjs --dry-run
 * ────────────────────────────────────────────────────────────────────
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ─── Load .env ──────────────────────────────────────────────────────
function loadEnv() {
    const envFiles = ['.env.local', '.env'];
    for (const file of envFiles) {
        const filePath = path.join(ROOT, file);
        if (fs.existsSync(filePath)) {
            const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) continue;
                const eqIndex = trimmed.indexOf('=');
                if (eqIndex === -1) continue;
                const key = trimmed.slice(0, eqIndex).trim();
                const val = trimmed.slice(eqIndex + 1).trim();
                if (!process.env[key]) process.env[key] = val;
            }
        }
    }
}
loadEnv();

const DRY_RUN = process.argv.includes('--dry-run');

// ─── 50-State Registry ─────────────────────────────────────────────
const STATES = [
    { key: 'alabama', name: 'Alabama', hashtag: 'alabama' },
    { key: 'alaska', name: 'Alaska', hashtag: 'alaska' },
    { key: 'arizona', name: 'Arizona', hashtag: 'arizona' },
    { key: 'arkansas', name: 'Arkansas', hashtag: 'arkansas' },
    { key: 'california', name: 'California', hashtag: 'california' },
    { key: 'colorado', name: 'Colorado', hashtag: 'colorado' },
    { key: 'connecticut', name: 'Connecticut', hashtag: 'connecticut' },
    { key: 'delaware', name: 'Delaware', hashtag: 'delaware' },
    { key: 'florida', name: 'Florida', hashtag: 'florida' },
    { key: 'georgia', name: 'Georgia', hashtag: 'georgia' },
    { key: 'hawaii', name: 'Hawaii', hashtag: 'hawaii' },
    { key: 'idaho', name: 'Idaho', hashtag: 'idaho' },
    { key: 'illinois', name: 'Illinois', hashtag: 'illinois' },
    { key: 'indiana', name: 'Indiana', hashtag: 'indiana' },
    { key: 'iowa', name: 'Iowa', hashtag: 'iowa' },
    { key: 'kansas', name: 'Kansas', hashtag: 'kansas' },
    { key: 'kentucky', name: 'Kentucky', hashtag: 'kentucky' },
    { key: 'louisiana', name: 'Louisiana', hashtag: 'louisiana' },
    { key: 'maine', name: 'Maine', hashtag: 'maine' },
    { key: 'maryland', name: 'Maryland', hashtag: 'maryland' },
    { key: 'massachusetts', name: 'Massachusetts', hashtag: 'massachusetts' },
    { key: 'michigan', name: 'Michigan', hashtag: 'michigan' },
    { key: 'minnesota', name: 'Minnesota', hashtag: 'minnesota' },
    { key: 'mississippi', name: 'Mississippi', hashtag: 'mississippi' },
    { key: 'missouri', name: 'Missouri', hashtag: 'missouri' },
    { key: 'montana', name: 'Montana', hashtag: 'montana' },
    { key: 'nebraska', name: 'Nebraska', hashtag: 'nebraska' },
    { key: 'nevada', name: 'Nevada', hashtag: 'nevada' },
    { key: 'new-hampshire', name: 'New Hampshire', hashtag: 'newhampshire' },
    { key: 'new-jersey', name: 'New Jersey', hashtag: 'newjersey' },
    { key: 'new-mexico', name: 'New Mexico', hashtag: 'newmexico' },
    { key: 'new-york', name: 'New York', hashtag: 'newyork' },
    { key: 'north-carolina', name: 'North Carolina', hashtag: 'northcarolina' },
    { key: 'north-dakota', name: 'North Dakota', hashtag: 'northdakota' },
    { key: 'ohio', name: 'Ohio', hashtag: 'ohio' },
    { key: 'oklahoma', name: 'Oklahoma', hashtag: 'oklahoma' },
    { key: 'oregon', name: 'Oregon', hashtag: 'oregon' },
    { key: 'pennsylvania', name: 'Pennsylvania', hashtag: 'pennsylvania' },
    { key: 'rhode-island', name: 'Rhode Island', hashtag: 'rhodeisland' },
    { key: 'south-carolina', name: 'South Carolina', hashtag: 'southcarolina' },
    { key: 'south-dakota', name: 'South Dakota', hashtag: 'southdakota' },
    { key: 'tennessee', name: 'Tennessee', hashtag: 'tennessee' },
    { key: 'texas', name: 'Texas', hashtag: 'texas' },
    { key: 'utah', name: 'Utah', hashtag: 'utah' },
    { key: 'vermont', name: 'Vermont', hashtag: 'vermont' },
    { key: 'virginia', name: 'Virginia', hashtag: 'virginia' },
    { key: 'washington', name: 'Washington', hashtag: 'washington' },
    { key: 'west-virginia', name: 'West Virginia', hashtag: 'westvirginia' },
    { key: 'wisconsin', name: 'Wisconsin', hashtag: 'wisconsin' },
    { key: 'wyoming', name: 'Wyoming', hashtag: 'wyoming' },
];

function getSlug(state) {
    return `how-to-get-your-pmhnp-license-in-${state.key}-2026-requirements-steps-salary`;
}

function getTitle(state) {
    return `How to Get Your PMHNP License in ${state.name} (2026 Guide)`;
}

function getDescription(state) {
    const slug = getSlug(state);
    return `Step-by-step guide to getting your PMHNP license in ${state.name} in 2026.

✅ Full practice authority details
✅ Prescriptive authority requirements
✅ Salary data & job market info
✅ Telehealth rules

📌 Full written guide: https://pmhnphiring.com/blog/${slug}
📌 Find PMHNP jobs: https://pmhnphiring.com/jobs

#pmhnp #nursepractitioner #${state.hashtag} #aprn #psychiatricnursing #mentalhealth`;
}

function getTags(state) {
    return [
        `pmhnp license ${state.name.toLowerCase()}`,
        `nurse practitioner ${state.name.toLowerCase()}`,
        `aprn ${state.name.toLowerCase()}`,
        `pmhnp ${state.name.toLowerCase()}`,
        `psychiatric nurse practitioner ${state.name.toLowerCase()}`,
    ];
}

function getSeoKeywords(state) {
    return [
        `pmhnp license ${state.name.toLowerCase()}`,
        `how to get pmhnp license ${state.name.toLowerCase()}`,
        `pmhnp ${state.name.toLowerCase()} requirements`,
        `nurse practitioner license ${state.name.toLowerCase()}`,
        `aprn license ${state.name.toLowerCase()}`,
        `pmhnp salary ${state.name.toLowerCase()}`,
        `psychiatric nurse practitioner ${state.name.toLowerCase()}`,
    ];
}

function getHashtags(state) {
    return [
        'pmhnp',
        'nursepractitioner',
        state.hashtag,
        'aprn',
        'psychiatricnursing',
        'mentalhealth',
        'nursepractitionerlife',
        'pmhnpstudent',
    ];
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  🌱 YouTube Videos — Database Seeder');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (DRY_RUN) {
        console.log('  🔍 DRY RUN MODE — no DB writes\n');
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
        console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const state of STATES) {
        const row = {
            id: crypto.randomUUID(),
            state_key: state.key,
            state_name: state.name,
            blog_slug: getSlug(state),
            yt_title: getTitle(state),
            yt_description: getDescription(state),
            yt_tags: getTags(state),
            seo_keywords: getSeoKeywords(state),
            hashtags: getHashtags(state),
            status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        if (DRY_RUN) {
            console.log(`  ✅ [DRY] ${state.name} → ${row.blog_slug}`);
            inserted++;
            continue;
        }

        // Upsert by state_key
        const { data, error } = await supabase
            .from('youtube_videos')
            .upsert(row, { onConflict: 'state_key' })
            .select('id, state_key')
            .single();

        if (error) {
            console.error(`  ❌ ${state.name}: ${error.message}`);
            skipped++;
        } else {
            console.log(`  ✅ ${state.name} → ${data.id}`);
            inserted++;
        }
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log(`  ✅ Seeded: ${inserted}  |  ⏭️ Skipped: ${skipped}`);
    console.log('═══════════════════════════════════════════════════════════');
}

main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
});
