require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL });

const CLEAN_CONTENT = `If you've heard that telehealth pays less because it's "easier," you're not alone. The telehealth PMHNP salary conversation is full of half-truths—usually based on one offer, one market, or one recruiter's pitch.

Here's what we see when we look across thousands of postings: telehealth often pays more than in-person. Not always, and not in every structure, but often enough that it's worth treating as a real negotiating advantage—not a perk you trade pay for.

## Why the telehealth PMHNP salary can run higher

Telehealth compensation isn't higher because employers are being generous. It's higher because the business math is different.

First, telehealth expands the candidate pool, but it also expands the employer's competition. A clinic in a small city isn't just competing with the hospital across town anymore. They're competing with national telepsychiatry groups and multi-state platforms that can move fast and pay to fill.

Second, telehealth models tend to be volume-sensitive. Many roles are built around productivity (RVUs, encounters, collections, or per-visit rates). When a company can reduce no-shows with flexible scheduling, shorten gaps between appointments, and standardize workflows, they can afford to pay more per unit of work—especially if they're hiring experienced PMHNPs who can ramp quickly.

Third, telehealth often targets high-demand coverage. Nights, weekends, rural access, and "we need someone licensed in X state yesterday" situations show up a lot in remote-first hiring. Urgency drives pay.

You'll still see lower offers in telehealth, but they're usually tied to one of two things: heavy reliance on 1099/per-visit pay with optimistic volume assumptions, or "brand name" platforms betting you'll accept less for flexibility.

## Myth-busting: "In-person always pays more"

In-person roles can pay very well—especially hospital-based positions with strong benefits and predictable base salaries. But "always pays more" doesn't hold up in the current market.

Across the PMHNP job market, national averages commonly land around $139K–$155K, with entry level around ~$126K. Telehealth frequently shows up at (or above) those ranges, particularly for fully remote roles that recruit across multiple states and need clinicians who can carry a steady caseload.

Another factor: time-to-fill is faster now (about 32 days, down from 45 in 2024). Employers that want to fill quickly tend to increase comp or offer stronger structures. Telehealth employers are often in that category because their models depend on staffing levels.

If you want to compare what's out there right now, scanning a large set of roles helps you spot patterns fast. You can look specifically at telehealth postings here: https://pmhnphiring.com/jobs/telehealth, and then compare to the broader market here: https://pmhnphiring.com/jobs.

## Where telehealth pay looks best (and where it doesn't)

Telehealth pay looks strongest when the job has a clear base salary (W-2) plus achievable incentives, or when the per-visit rate is paired with consistent demand and strong operational support (intake pipeline, scheduling, prior auth help, and responsive clinical leadership).

It looks weaker when the "salary" is really a best-case projection. If the offer is framed as "you can make up to…" but the employer can't tell you average clinician volume, average show rate, and ramp time, you're being asked to take the business risk.

Also, don't ignore the difference between remote-eligible and truly remote. A role might be labeled telehealth but still require local on-site orientation, hybrid coverage, or in-state residence. Those constraints can reduce competition and sometimes reduce pay.

## How to compare offers apples-to-apples

Most pay confusion happens because candidates compare base salary in one offer to total compensation in another.

For in-person roles, get clarity on base, bonus structure, call expectations, and how often "extra coverage" becomes the norm. For telehealth roles, pin down whether pay is salary, hourly, per-visit, or collections-based—and what happens when volume dips.

A quick way to pressure-test a telehealth offer is to ask for three numbers: expected weekly completed visits after ramp, average no-show rate, and the median clinician compensation for your level of experience. If they can't answer at least two of those, treat the headline rate as marketing.

If you want a broader benchmark before negotiating, this salary guide is a good starting point: https://pmhnphiring.com/salary-guide.

## Negotiation moves that work in telehealth (without being awkward)

Telehealth employers are often more flexible on structure than on the headline number. That's not bad news—it's opportunity.

If the base is firm, ask about a ramp guarantee (a temporary floor while your panel builds), a sign-on bonus tied to a reasonable timeline, or a higher rate for evenings/weekends. If the role is per-visit, negotiate a minimum monthly guarantee or a higher rate after a certain completed-visit threshold.

And if you're licensed in multiple states, say it early. Multi-state coverage is one of the cleanest ways to justify higher pay in telehealth because it directly expands capacity.

## The bottom line

Telehealth often pays more, but the best-paying roles are the ones with transparent volume expectations and a compensation structure that doesn't push all the risk onto the clinician. In-person can still win on benefits, stability, and team-based support—so "better" depends on what you value and how the offer is built.

Either way, don't negotiate based on myths. Negotiate based on the actual pay model in front of you.`;

(async () => {
    // Find the latest telehealth post
    const findRes = await pool.query(`
    SELECT id, title FROM blog_posts 
    WHERE title ILIKE '%Telehealth vs In-Person%'
    ORDER BY created_at DESC
    LIMIT 1
  `);

    if (findRes.rows.length === 0) {
        console.log('No matching post found');
        await pool.end();
        return;
    }

    const postId = findRes.rows[0].id;
    console.log('Found:', findRes.rows[0].title, '(ID:', postId + ')');

    // Update with clean content
    await pool.query(
        `UPDATE blog_posts SET content = $1, updated_at = NOW() WHERE id = $2`,
        [CLEAN_CONTENT, postId]
    );

    console.log('Updated with clean markdown content');
    console.log('Content length:', CLEAN_CONTENT.length);
    console.log('Has newlines:', CLEAN_CONTENT.includes('\n'));

    await pool.end();
})();
