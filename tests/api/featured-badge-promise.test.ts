/**
 * Featured-badge promise + employer distribution regression locks.
 *
 * 2026-08 audit, facts 7-8 and 12:
 *   - "Featured badge" is SOLD on /pricing and promised in the confirmation
 *     email, but no UI ever rendered one. Resolution: make the promise true.
 *     JobCard now renders a ★ Featured chip for employer-posted jobs in BOTH
 *     grid and list views (display-only; ordering is untouched).
 *   - The homepage pool capped ALL jobs at 3 days old, so a paid 30/60-day
 *     employer post vanished from the homepage after 72h of its term. The
 *     employer pin pool is now un-windowed; only the scraped fill pool keeps
 *     the 3-day freshness cap.
 *   - The employer confirmation email had no share kit; it now carries
 *     prefilled X / LinkedIn / Facebook / WhatsApp intent links mirroring
 *     components/ShareMenu.tsx.
 *
 * Source-reading locks in the style of tests/api/renewal-cta.test.ts.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const read = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

describe('the Featured badge promise is actually rendered', () => {
  const jobCard = read('components/JobCard.tsx');

  it('JobCard renders a ★ Featured chip', () => {
    expect(jobCard).toMatch(/★ Featured/);
  });

  it('the chip keys on employer-posted (not only isFeatured), so legacy rows with isFeatured:false still show it', () => {
    expect(jobCard).toMatch(/sourceType === 'employer' \|\| job\.isFeatured === true/);
  });

  it('the chip appears in BOTH the list and grid chip rows', () => {
    // The chip element is built once and must be placed twice (list badge
    // row + grid Row 3).
    const placements = jobCard.match(/\{featuredChip\}/g) ?? [];
    expect(placements.length).toBeGreaterThanOrEqual(2);
  });

  it('the email job card renders the same ★ Featured treatment', () => {
    expect(read('lib/utils/render-job-card.ts')).toMatch(/★ Featured/);
  });
});

describe('copy consistency: everywhere the badge is sold, it says the same thing', () => {
  it('/pricing sells the Featured badge (hero checklist + FAQ)', () => {
    const pricing = read('app/pricing/page.tsx');
    expect(pricing).toMatch(/★ Featured badge/);
    expect(pricing).toMatch(/Featured badge, top placement/);
  });

  it('the confirmation email features line promises the Featured badge', () => {
    expect(read('lib/email-service.ts')).toMatch(/Featured badge/);
  });
});

describe('homepage employer pool (FeaturedJobsSection)', () => {
  const src = read('components/FeaturedJobsSection.tsx');

  it('the employer pin pool is fetched WITHOUT the 3-day freshness window', () => {
    // The employer query selects on sourceType 'employer' and must not carry
    // the threeDaysAgo bound; the fill query keeps it.
    const employerQueryStart = src.indexOf("sourceType: 'employer'");
    expect(employerQueryStart).toBeGreaterThan(-1);
    const employerQueryBlock = src.slice(employerQueryStart, src.indexOf('take:', employerQueryStart));
    expect(employerQueryBlock).not.toMatch(/threeDaysAgo/);
  });

  it('the scraped fill pool keeps the 3-day window', () => {
    expect(src).toMatch(/originalPostedAt: \{ gte: threeDaysAgo \}/);
  });

  it('the employer pool still excludes expired posts', () => {
    expect(src).toMatch(/expiresAt: \{ gt: now \}/);
  });

  it('the 6h rotation is preserved', () => {
    expect(src).toMatch(/sixHourBucket\(\)/);
  });

  it('pins draw from the un-windowed employer query, not the 3-day fill pool', () => {
    expect(src).toMatch(/employerCandidates as RawJob\[\]/);
  });
});

describe('isFeatured write consistency across the three post paths (audit fact 7)', () => {
  // The column must stop lying: /pricing promises the Featured badge on free
  // AND paid posts, and the employer messaging + candidate-unlock gates key
  // on Job.isFeatured. The flag flips exactly when a post becomes LIVE:
  //   - post-free      → at creation (free posts publish immediately)
  //   - create-checkout → NOT at creation (pending unpaid draft; the
  //     messaging gate checks only isFeatured + ownership, so featuring a
  //     pending row would unlock InMail outreach for a never-paid post)
  //   - stripe webhook  → new-post branch features alongside isPublished;
  //     renewal branch already did
  it('post-free features the post at creation via config.isFeaturedTier', () => {
    expect(read('app/api/jobs/post-free/route.ts')).toMatch(
      /isFeatured: config\.isFeaturedTier\('pro'\)/,
    );
  });

  it('create-checkout keeps the pending draft unfeatured until payment', () => {
    const src = read('app/api/create-checkout/route.ts');
    expect(src).toMatch(/isFeatured: false/);
    // The rationale must stay documented next to the write — it is the only
    // thing standing between a refactor and an unpaid-outreach hole.
    expect(src).toMatch(/messaging gate/);
  });

  it('the stripe webhook features on publish in BOTH branches (renewal + new post)', () => {
    const src = read('app/api/webhooks/stripe/route.ts');
    const flips = src.match(/config\.isFeaturedTier\([^)]*\) && \{ isFeatured: true \}/g) ?? [];
    expect(flips.length).toBe(2);
  });

  it('full refund AND chargeback revoke the featured flag with the unpublish', () => {
    // Now that every live employer post is featured, a revoked post keeping
    // isFeatured:true would keep paid entitlements (messaging, candidate
    // unlocks) alive after the money came back.
    const src = read('app/api/webhooks/stripe/route.ts');
    const revocations = src.match(/isPublished: false, isFeatured: false/g) ?? [];
    expect(revocations.length).toBe(2);
  });

  it('the messaging gate requires an ACTIVE posting: featured + published + unexpired', () => {
    // Both gate queries (jobId path and any-posting path). isFeatured alone
    // left InMail outreach open after refund/chargeback/expiry.
    const src = read('app/api/employer/messages/route.ts');
    const gates = src.match(/isFeatured: true,\s*\n\s*isPublished: true,\s*\n\s*expiresAt: \{ gt: new Date\(\) \}/g) ?? [];
    expect(gates.length).toBe(2);
  });
});

describe('confirmation email share kit', () => {
  const src = read('lib/email-service.ts');
  const start = src.indexOf('export async function sendConfirmationEmail');
  const end = src.indexOf('\nexport ', start + 10);
  const body = src.slice(start, end === -1 ? undefined : end);

  it('exists inside sendConfirmationEmail', () => {
    expect(start).toBeGreaterThan(-1);
    expect(body).toMatch(/Share your post/);
  });

  it('carries all four share-intent hosts from ShareMenu', () => {
    expect(body).toMatch(/x\.com\/intent\/tweet/);
    expect(body).toMatch(/linkedin\.com\/sharing\/share-offsite/);
    expect(body).toMatch(/facebook\.com\/sharer\/sharer\.php/);
    expect(body).toMatch(/wa\.me\/\?text=/);
  });

  it('shares the job canonical URL, URI-encoded', () => {
    expect(body).toMatch(/encodeURIComponent\(canonicalJobUrl\)/);
  });

  it('intent URL patterns stay in sync with the on-site ShareMenu', () => {
    const menu = read('components/ShareMenu.tsx');
    for (const host of [
      'x.com/intent/tweet',
      'linkedin.com/sharing/share-offsite',
      'facebook.com/sharer/sharer.php',
      'wa.me/?text=',
    ]) {
      expect(menu).toContain(host);
      expect(body).toContain(host);
    }
  });
});
