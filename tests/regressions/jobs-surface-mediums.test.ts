/**
 * Regressions for the /jobs surface: the listing page and its client, the
 * sidebar filters, the message-employer dialog, and the geo pSEO templates
 * (job detail, city, state, metro, locations).
 *
 * Each block pins one defect that shipped. Source assertions rather than a
 * rendered page, because every one of these routes needs a live database and
 * these are the exact lines that regressed: a stronger test that cannot run in
 * CI catches nothing.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getCityBySlug } from '../../lib/pseo/city-data/cities';

const ROOT = path.resolve(__dirname, '../../');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/**
 * Same source with block and line comments blanked. A "do not do X" assertion
 * has to ignore the engineering note explaining why X was removed, or the note
 * keeps the test red on its own.
 */
const readCode = (rel: string): string =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const JOBS_CLIENT = 'app/jobs/JobsPageClient.tsx';
const JOBS_PAGE = 'app/jobs/page.tsx';
const FILTERS = 'components/jobs/LinkedInFilters.tsx';
const MESSAGE_MODAL = 'components/jobs/MessageEmployerModal.tsx';
const JOB_DETAIL = 'app/jobs/[slug]/page.tsx';
const CITY_PAGE = 'app/jobs/city/[slug]/page.tsx';
const STATE_PAGE = 'app/jobs/state/[state]/page.tsx';
const METRO_PAGE = 'app/jobs/metro/[slug]/page.tsx';
const LOCATIONS_PAGE = 'app/jobs/locations/page.tsx';
const REMOTE_PAGE = 'app/jobs/remote/page.tsx';

describe('/jobs listing: malformed ?page never empties the board', () => {
  it('the SSR fetch clamps page before computing skip', () => {
    const src = read(JOBS_PAGE);
    // `?page=0` / `?page=-1` / `?page=abc` produced a negative or NaN skip,
    // Prisma rejected it, and the catch rendered "No jobs found" at HTTP 200.
    expect(src).not.toMatch(/const page = parseInt\(\(params\.page as string\) \|\| '1'\)/);
    expect(src).toMatch(/Number\.isFinite\(rawPage\) && rawPage > 0 \? rawPage : 1/);
  });

  it('the client does not serialize page=NaN back into /api/jobs', () => {
    const src = read(JOBS_CLIENT);
    // Math.max(1, NaN) === NaN, so `?page=abc` round-tripped as `page=NaN`.
    expect(src).not.toMatch(/Math\.max\(1, parseInt\(params\.get\('page'\)/);
    expect(src).toMatch(/Number\.isFinite\(rawPage\) && rawPage > 0 \? rawPage : 1/);
  });
});

describe('/jobs listing: URL is the source of truth for sort', () => {
  const src = read(JOBS_CLIENT);

  it('the searchParams effect re-reads sort instead of using stale state', () => {
    // Browser Back after a sort change left the dropdown and the fetched order
    // on the previous sort, because sortOption was seeded once at mount.
    expect(src).toMatch(/const sortFromUrl = params\.get\('sort'\) \|\| 'best'/);
    expect(src).toMatch(/setSortOption\(sortFromUrl\)/);
    expect(src).toMatch(/fetchJobs\(filters, pageFromUrl, sortFromUrl\)/);
    expect(src).not.toMatch(/fetchJobs\(filters, pageFromUrl, sortOption\)/);
  });

  it('every sidebar push carries the active sort across', () => {
    const filters = read(FILTERS);
    // filtersToParams rebuilds the query string from FilterState, which has no
    // sort field, so a raw push dropped ?sort on the first filter click.
    expect(filters).toMatch(/const buildJobsHref = useCallback/);
    expect(filters).toMatch(/const sort = searchParams\.get\('sort'\)/);
    expect(filters).not.toMatch(/router\.push\(`\/jobs\?\$\{filtersToParams\(/);
  });
});

describe('/jobs listing: filters and sort are never silently inert', () => {
  const src = read(JOBS_CLIENT);

  it('a URL change clears the AI results the browse list is hidden behind', () => {
    // `(aiResults ?? jobs)` means a non-null aiResults hides the browse list
    // entirely, so filtering while AI results were on screen changed the URL,
    // ran a fetch, and rendered nothing different.
    expect(src).toMatch(/clearAiSearch\(\);/);
    const effect = src.slice(src.indexOf('// Fetch jobs when filters change'));
    expect(effect.slice(0, effect.indexOf('}, [searchParams])'))).toContain('clearAiSearch()');
  });

  it('the keyword fallback writes its query to the URL', () => {
    // The sidebar chip, the filter count and the "Clear filters" link all read
    // the URL; a fallback query held only in local state was invisible and
    // unremovable, and "Clear filters" (href /jobs) was a no-op.
    expect(src).toMatch(/const params = filtersToParams\(nextFilters\);/);
    expect(src).not.toMatch(/setCurrentFilters\(nextFilters\);\s*\n\s*fetchJobs\(nextFilters, 1, sortOption\)/);
  });
});

describe('/jobs listing: request ordering and controls', () => {
  const src = read(JOBS_CLIENT);

  it('supersedes in-flight job fetches instead of racing them', () => {
    expect(src).toMatch(/new AbortController\(\)/);
    expect(src).toMatch(/signal: controller\.signal/);
    // A superseded response must not repaint the list.
    expect(src).toMatch(/if \(inFlightRef\.current !== controller\) return;/);
  });

  it('the sort dropdown has an accessible name', () => {
    const select = src.slice(src.indexOf('className="jp-sort-select"') - 400, src.indexOf('<option value="best">'));
    expect(select).toContain('aria-label="Sort jobs"');
  });

  it('the active-filter count covers every filter the sidebar can set', () => {
    // A zero-result combination of only uncounted filters (specialty,
    // easyApply, minYears, category, ...) showed the no-filter "Set up a job
    // alert" copy and no "Clear filters" recovery link.
    for (const key of [
      'specialty', 'experienceLevel', 'newGradFriendly', 'minYearsExperience',
      'easyApply', 'employer', 'category',
    ]) {
      expect(src).toMatch(new RegExp(`currentFilters\\.${key}`));
    }
  });

  it('a whitespace-only keyword search is not an active filter', () => {
    const filters = read(FILTERS);
    expect(filters).toMatch(/const search = searchInput\.trim\(\);/);
    expect(filters).not.toMatch(/search: searchInput \|\| undefined/);
  });
});

describe('message-employer dialog', () => {
  const src = read(MESSAGE_MODAL);

  it('is a real dialog: role, aria-modal, focus trap, Escape, named close button', () => {
    expect(src).toContain("useFocusTrap");
    expect(src.match(/role="dialog"/g) ?? []).toHaveLength(2);
    expect(src.match(/aria-modal="true"/g) ?? []).toHaveLength(2);
    expect(src).toContain('aria-labelledby="message-employer-title"');
    expect(src).toContain('aria-labelledby="message-employer-login-title"');
    expect(src).toContain('aria-label="Close message dialog"');
  });

  it('sends post-login returns through the param /login actually reads', () => {
    // /login honours ?redirectTo= and ?next= only; ?redirect= was dropped and
    // the user landed on /dashboard. Its value was also the job UUID, not the
    // slug.
    expect(src).not.toMatch(/\/login\?redirect=/);
    expect(src).toMatch(/\/login\?redirectTo=/);
  });

  it('does not link to /profile, which is not a route', () => {
    expect(src).not.toContain("'/profile");
    expect(src).toContain("/settings?tab=personal");
  });
});

describe('job detail metadata', () => {
  const src = read(JOB_DETAIL);

  it('never cuts a SERP title mid-word', () => {
    expect(readCode(JOB_DETAIL)).not.toContain('.slice(0, 65)');
    expect(src).toMatch(/const fittingTitle = titleCandidates\.find/);
    // A scraped title over budget ships absolute so the brand suffix is not
    // appended to an already-too-long complete phrase.
    expect(src).toMatch(/\{ absolute: job\.title \}/);
  });

  it('does not advertise freshness that ingestion manufactured', () => {
    // lib/ingestion-service.ts stamps updatedAt on every re-sighting whether
    // or not a field changed, so "Last updated" said today about an unchanged
    // posting. Job has no contentChangedAt column.
    expect(readCode(JOB_DETAIL)).not.toMatch(/Last updated:/);
    // The honest signals that replaced it.
    expect(src).toMatch(/job\.lastRenewedAt/);
  });
});

describe('geo pages apply the shared MIN_JOBS gate', () => {
  it('the state hub drops a sub-threshold count from the title and noindexes', () => {
    const src = read(STATE_PAGE);
    expect(src).toMatch(/categoryTitleCount\(stats\.totalJobs\)/);
    expect(src).toMatch(/categoryLandingRobotsMeta\(stats\.totalJobs, page\)/);
    // "1 PMHNP Jobs in Wyoming (WY)" was both ungrammatical and a doorway signal.
    expect(src).not.toMatch(/\$\{stats\.totalJobs\} PMHNP Jobs in \$\{stateName\}/);
  });

  it('the metro hub noindexes below the floor and does not say "1 live roles"', () => {
    const src = read(METRO_PAGE);
    expect(src).toMatch(/categoryLandingRobotsMeta\(stats\.totalJobs\)/);
    expect(src).not.toMatch(/badgeText=\{`\$\{stats\.totalJobs\} live roles`\}/);
    expect(src).not.toMatch(/\{ value: `\$\{stats\.totalJobs\}\+`, label: 'positions' \}/);
  });

  it('the city page index gate matches the sitemap gate', () => {
    const src = read(CITY_PAGE);
    // app/sitemap.ts refuses to advertise a registry-less slug or a city under
    // MIN_SITEMAP_POPULATION; the page was still asking to be indexed.
    expect(src).toMatch(/function isCityIndexable/);
    expect(src).toMatch(/MIN_SITEMAP_POPULATION/);
    expect(src).toMatch(/isCityIndexable\(effectiveSlug, stats\.totalJobs\)/);
  });

  it('the locations directory only links city pages that answer 200', () => {
    const src = read(LOCATIONS_PAGE);
    expect(src).toMatch(/c\._count\.city >= MIN_JOBS_FOR_CATEGORY_CITY/);
    // Metro slugs 308 from /jobs/city/*; link the destination directly.
    expect(src).toMatch(/cityLinkHref\(slug\)/);
    expect(src).not.toMatch(/href=\{`\/jobs\/city\/\$\{city\.slug\}`\}/);
  });
});

describe('geo pages never publish a salary figure they cannot compute', () => {
  it('the city page has no invented $130K fallback, including in FAQ schema', () => {
    const src = read(CITY_PAGE);
    // CategoryFAQ serializes these answers into FAQPage JSON-LD, so an
    // invented range was shipped as structured data.
    const code = readCode(CITY_PAGE);
    expect(code).not.toMatch(/\$130K/);
    expect(code).not.toMatch(/\$130,000/);
  });
});

describe('deep pagination answers 404, not a noindexed 200', () => {
  it('the state hub bails past the last page', () => {
    expect(read(STATE_PAGE)).toMatch(/if \(page > 1 && jobs\.length === 0\) \{\s*\n\s*notFound\(\);/);
  });

  it('the remote landing bails past the last page', () => {
    expect(read(REMOTE_PAGE)).toMatch(/if \(page > 1 && jobs\.length === 0\) \{\s*\n\s*notFound\(\);/);
  });
});

describe('ItemList entries point at the canonical job URL', () => {
  it('no /jobs page falls back to the bare UUID', () => {
    // Job.slug is nullable. The detail page declares
    // `job.slug || slugify(job.title, job.id)` canonical, so an ItemList
    // writing /jobs/{uuid} advertised a duplicate variant of its own canonical
    // and the summary-page relationship never consolidated.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name) && read(path.relative(ROOT, full)).includes('job.slug || job.id')) {
          offenders.push(path.relative(ROOT, full).replace(/\\/g, '/'));
        }
      }
    };
    walk(path.join(ROOT, 'app/jobs'));
    expect(offenders).toEqual([]);
  });
});

describe('punctuated city slugs resolve to the stored city name', () => {
  // The premise of the /jobs/city fix: the CITIES registry carries the real
  // spelling, while title-casing the slug segments does not. Without the
  // registry lookup the page queried "St Louis" and 404d a sitemapped URL.
  const titleCaseSlug = (slug: string): string =>
    slug.replace(/-[a-z]{2}$/, '')
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

  it.each([
    ['st-louis-mo', 'St. Louis'],
    ['winston-salem-nc', 'Winston-Salem'],
    ['st-petersburg-fl', 'St. Petersburg'],
  ])('%s resolves to %s, which the slug parse cannot produce', (slug, expected) => {
    expect(getCityBySlug(slug)?.name).toBe(expected);
    expect(titleCaseSlug(slug)).not.toBe(expected);
  });

  it('the city page resolves names through the registry, not the slug parse', () => {
    const src = read(CITY_PAGE);
    expect(src).toMatch(/function resolveCityFromSlug/);
    expect(src).toMatch(/city: \{ in: cityNames, mode: 'insensitive' \}/);
  });
});
