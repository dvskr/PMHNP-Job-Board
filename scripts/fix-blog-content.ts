/**
 * Fix the corrupted blog post content.
 * The first formatter run broke URLs — this script provides the original
 * raw content and re-applies the fixed formatter.
 *
 * Run: npx tsx scripts/fix-blog-content.ts
 */
import { createClient } from '@supabase/supabase-js';
import { formatBlogContent } from '../lib/blog-formatter';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// Original blog post content (before any formatting was applied)
const ORIGINAL_CONTENT = `## Why remote PMHNP jobs are still growing in 2026
Demand hasn't cooled. PMHNP job growth is still projected at 35% from 2024–2034, and employers have gotten faster at hiring. Average time-to-fill is about 32 days now, down from 45 in 2024. That speed is great when you're ready to move, but it also means some postings are written fast and left vague.

Remote-eligible roles are also a larger share of the market than they were even a year or two ago. We're seeing about 62% of roles marked remote-eligible (up from 55% in 2025 and 48% in 2024). That doesn't mean 62% are "work-from-anywhere." It means you need to read the fine print.

If you want a broad view of what's actually out there right now, PMHNP Hiring aggregates 10,000+ verified PMHNP jobs from 500+ sources across all 50 states, updated daily. You can filter specifically for remote roles here: https://pmhnphiring.com/jobs?type=remote.

## "Remote" can mean three different things in job posts
Most remote PMHNP jobs fall into one of three buckets.

First is fully remote telepsychiatry within one state. You can work from home, but you must live in (and be licensed in) the state where patients are located. Sometimes it's "must reside in-state," other times it's "must be licensed in-state." Those are not the same requirement.

Second is multi-state telehealth, but not location-independent. These roles may require you to hold licenses in multiple states (or be willing to get them), and they often have specific coverage needs. The post may say "remote," but the schedule could include evening blocks, weekend rotations, or set availability windows tied to time zones.

Third is hybrid labeled as remote. This is the one that causes the most frustration. The post headline says remote, but the description includes in-person onboarding, periodic clinic coverage, local patient intakes, or required travel to partner sites.

When you want to compare true telehealth roles side-by-side, it helps to also scan listings tagged specifically as telehealth: https://pmhnphiring.com/jobs?type=telehealth.

## Red flags that "remote" isn't really remote
A few phrases should make you slow down and verify details.

One is "remote with occasional in-person as needed." That can be reasonable, but "as needed" is undefined. Ask what triggers in-person work, how often it happened in the last 90 days, and whether it's written into the offer.

Another is "must be within commuting distance." That's hybrid. Sometimes it's a compliance or supervision requirement, sometimes it's a coverage plan. Either way, it's not fully remote.

Watch for "remote after training" without a timeline. Is training two weeks, three months, or "until we feel comfortable"? Get a date.

Also look for mismatches between the job title and the work described. If the role is posted as "Telehealth PMHNP" but includes "rounding," "inpatient consults," or "on-site crisis coverage," you're looking at a blended position.

Finally, be cautious with compensation that's dramatically above market without clarity on volume, call, or documentation expectations. Telehealth often pays more than in-person, but the tradeoff can be productivity pressure. National averages tend to land around $139K–$155K, with entry level around $126K. If the pay is far above that, make sure you understand exactly what you're being paid to do.

If you want to sanity-check ranges, you can look at salary data by state and setting here: https://pmhnphiring.com/salaries.

## What to verify before you apply (and before you accept)

Start with licensure and patient location. Ask: "Which states are patients located in, and which licenses are required on day one?" If they say "we'll help you get licensed," ask whether you can start seeing patients before additional licenses are issued.

Next, clarify the clinical model. Is it medication management only, therapy + med management, or collaborative care? What's the expected follow-up cadence? What's the policy on controlled substances and initial evaluations by video?

Then ask about schedule mechanics. Are hours flexible or fixed blocks? Any weekends? Any on-call? Remote roles can still have very structured coverage requirements.

Finally, confirm support and workflow. Who does prior auths? Who handles scheduling, refills, and patient messaging? What EHR is used? Remote work feels very different when you're doing your own admin.

## How to find better remote PMHNP jobs faster in 2026

Treat "remote" as a starting point, not a conclusion. Filter for remote, then read for state restrictions, onboarding requirements, and any in-person language. If you're targeting a specific state for licensing reasons, use the state pages to narrow your search (for example: https://pmhnphiring.com/states/california).

And keep your own deal-breakers written down. Is it "no in-person, period"? "No weekends"? "No 1099"? The fastest way to avoid wasted time is to screen postings consistently.

Browse remote PMHNP jobs → https://pmhnphiring.com/jobs?type=remote`;

async function main() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
        console.error('Missing SUPABASE env vars');
        process.exit(1);
    }

    console.log('Connecting to Supabase...');
    console.log('URL:', url);

    const supabase = createClient(url, key);

    // First, show what the formatter produces
    const formatted = formatBlogContent(ORIGINAL_CONTENT);

    console.log('\n=== FORMATTED OUTPUT PREVIEW ===\n');
    console.log(formatted);
    console.log('\n=== END PREVIEW ===\n');

    // Update the post
    const { error } = await supabase
        .from('blog_posts')
        .update({ content: formatted })
        .eq('slug', 'remote-pmhnp-jobs-in-2026-what-remote-really-means');

    if (error) {
        console.error('Error updating post:', error.message);
        process.exit(1);
    }

    console.log('✅ Blog post content updated successfully!');
}

main().catch(console.error);
