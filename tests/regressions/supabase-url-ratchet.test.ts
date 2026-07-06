/**
 * Ratchet guard for hardcoded Supabase asset-host literals.
 *
 * lib/asset-url.ts is the single sanctioned home for the asset host
 * ('sggccmqjzuimwlahocmy.supabase.co') — everything else should build URLs
 * via siteAsset()/storageAsset(). The long tail of page files below still
 * hardcodes the host; this test freezes that set so it can only shrink:
 *
 *   files may be REMOVED from this list as they migrate to lib/asset-url.ts;
 *   adding a NEW file is forbidden.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ASSET_HOST = 'sggccmqjzuimwlahocmy.supabase.co';
const SCAN_DIRS = ['app', 'components', 'lib', 'config'];
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs)$/;

// Files that just migrated to lib/asset-url.ts — they must STAY clean.
const MIGRATED = [
  'lib/pseo/category-asset-registry.ts',
  'components/StateImage.tsx',
  'lib/pseo/category-city-template.tsx',
];

const ALLOWLIST = [
  // The one sanctioned definition site (default base URL lives here).
  'lib/asset-url.ts',
  // ── legacy hardcoded tail — remove entries as they migrate ──
  'app/about/AboutClient.tsx',
  'app/about/page.tsx',
  'app/api/email-preview/v2-templates.ts',
  'app/api/salary-guide/route.ts',
  'app/blog/page.tsx',
  'app/companies/page.tsx',
  'app/contact/page.tsx',
  'app/faq/page.tsx',
  'app/for-employers/page.tsx',
  'app/for-job-seekers/page.tsx',
  'app/job-alerts/page.tsx',
  'app/jobs/1099/page.tsx',
  'app/jobs/addiction/page.tsx',
  'app/jobs/behavioral-health/page.tsx',
  'app/jobs/child-adolescent/page.tsx',
  'app/jobs/city/[slug]/page.tsx',
  'app/jobs/community-health/page.tsx',
  'app/jobs/contract/page.tsx',
  'app/jobs/correctional/page.tsx',
  'app/jobs/crisis/page.tsx',
  'app/jobs/entry-level/page.tsx',
  'app/jobs/full-time/page.tsx',
  'app/jobs/geriatric/page.tsx',
  'app/jobs/hospital/page.tsx',
  'app/jobs/inpatient/page.tsx',
  'app/jobs/lgbtq/page.tsx',
  'app/jobs/locations/page.tsx',
  'app/jobs/locum-tenens/page.tsx',
  'app/jobs/metro/[slug]/page.tsx',
  'app/jobs/mid-career/page.tsx',
  'app/jobs/new-grad/page.tsx',
  'app/jobs/outpatient/page.tsx',
  'app/jobs/page.tsx',
  'app/jobs/part-time/page.tsx',
  'app/jobs/per-diem/page.tsx',
  'app/jobs/private-practice/page.tsx',
  'app/jobs/remote/page.tsx',
  'app/jobs/senior/page.tsx',
  'app/jobs/state/[state]/page.tsx',
  'app/jobs/substance-abuse/page.tsx',
  'app/jobs/telehealth/page.tsx',
  'app/jobs/travel/page.tsx',
  'app/jobs/va/page.tsx',
  'app/jobs/veterans/page.tsx',
  'app/jobs/[slug]/page.tsx',
  'app/layout.tsx',
  'app/page.tsx',
  'app/pricing/page.tsx',
  'app/privacy/page.tsx',
  'app/resources/1099-vs-w2/page.tsx',
  'app/resources/fpa-guide/page.tsx',
  'app/resources/page.tsx',
  'app/resources/private-practice-guide/page.tsx',
  'app/salary-guide/page.tsx',
  'app/salary-guide/[state]/page.tsx',
  'app/terms/page.tsx',
  'components/EmployerHowItWorks.tsx',
  'components/FeaturedJobs.tsx',
  'components/HomepageHero.tsx',
  'components/LicensureChecker.tsx',
  'components/VideoJsonLd.tsx',
  'lib/email-service.ts',
  'lib/env.ts',
  'lib/image-seo.ts',
  'lib/pseo/setting-state-template.tsx',
  'lib/video-seo.ts',
];

function filesContainingHost(): string[] {
  const hits: string[] = [];
  const walk = (dir: string) => {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (SOURCE_EXT.test(e.name)) {
        const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        if (src.includes(ASSET_HOST)) hits.push(rel);
      }
    }
  };
  SCAN_DIRS.forEach(walk);
  return hits;
}

describe('supabase asset-host ratchet', () => {
  const hits = filesContainingHost();

  it('no NEW file hardcodes the asset host — use siteAsset()/storageAsset() from lib/asset-url.ts', () => {
    const allowed = new Set(ALLOWLIST);
    const newOffenders = hits.filter((f) => !allowed.has(f));
    expect(newOffenders).toEqual([]);
  });

  it('lib/asset-url.ts remains the sanctioned definition site', () => {
    expect(ALLOWLIST).toContain('lib/asset-url.ts');
    expect(hits).toContain('lib/asset-url.ts');
  });

  it('already-migrated files are not allowlisted and stay clean', () => {
    for (const f of MIGRATED) {
      expect(ALLOWLIST).not.toContain(f);
      expect(hits).not.toContain(f);
    }
  });
});
