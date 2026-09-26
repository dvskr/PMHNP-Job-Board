import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { LOGO_DATA_URI } from './_logo';

export const runtime = 'edge';

// ─── Shared OG visual system ────────────────────────────────────────────────
// Mirrored in app/api/og/city/route.tsx: warm cream ground, deep teal accent,
// near-black ink, pill chips, thin domain bottom bar. Satori constraints:
// flexbox only (display:block solely for the lineClamp'd title), explicit dims.
const INK = '#1A2E35';
const MUTED = '#5F6E74';
const CREAM = '#F7F5F0';
const TEAL = '#0D9488';
const TEAL_DARK = '#0F766E';
const TEAL_TINT = 'rgba(13, 148, 136, 0.10)';
const TEAL_EDGE = 'rgba(13, 148, 136, 0.35)';
const SURFACE = '#FFFFFF';
const BORDER = '#E4DED2';

function chip(label: string, accent = false) {
  return (
    <div
      key={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '12px 26px',
        borderRadius: 999,
        backgroundColor: accent ? TEAL_TINT : SURFACE,
        border: `1px solid ${accent ? TEAL_EDGE : BORDER}`,
        color: accent ? TEAL_DARK : INK,
        fontSize: 24,
        fontWeight: 600,
      }}
    >
      {label}
    </div>
  );
}

function titleFontSize(text: string): number {
  if (text.length > 70) return 46;
  if (text.length > 44) return 54;
  return 62;
}

/**
 * Size for the pay slab.
 *
 * Satori does not wrap or hyphenate, and nothing clips the 1200px frame, so
 * an over-long string walks off the card rather than reflowing. The strings
 * that reach here are short and predictable ("$168k to $195k", "$168k+",
 * "Up to $195k"), and these steps keep every one of them inside the 1072px
 * content column.
 */
function salaryFontSize(text: string): number {
  if (text.length > 18) return 76;
  if (text.length > 14) return 92;
  return 108;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Query-param contract (unchanged): title, type=page, subtitle, company,
  // salary, location, jobType, isNew, experience. `v` is a cache buster only.
  const title = searchParams.get('title');
  const type = searchParams.get('type'); // 'page' for category/blog/location pages
  const subtitle = searchParams.get('subtitle') || '';
  const company = searchParams.get('company') || 'PMHNP Hiring';
  const salary = searchParams.get('salary') || 'Competitive Pay';
  const location = searchParams.get('location') || 'Remote / On-site';
  // No default. The JD page only forwards jobType when the column is set
  // (app/jobs/[slug]/page.tsx), so a missing param means "schedule unknown",
  // not "full time". The old `|| 'Full-time'` printed a schedule chip on
  // every PRN, per diem and locum posting whose jobType is null, contradicting
  // the page body and the JSON-LD on the same URL. components/JobStructuredData.tsx
  // already made the matching decision for employmentType: omit, never guess.
  const jobType = searchParams.get('jobType') || '';
  const isNew = searchParams.get('isNew') === 'true';
  // Optional experience chip ("New grad welcome", "5+ yrs") forwarded by the
  // JD page metadata.
  const experience = searchParams.get('experience') || '';
  const isHomepage = !title && type !== 'page';
  const isPageType = type === 'page';

  // JS-side cap keeps the worst case bounded; lineClamp handles the visual
  // two-line ellipsis.
  const displayTitle = title
    ? (title.length > 96 ? title.slice(0, 93) + '...' : title)
    : '';
  const displayCompany = company.length > 58 ? company.slice(0, 55) + '...' : company;

  // Callers only pass real values; defaults mean "nothing to show".
  const hasSalary = salary !== '0' && salary !== 'Hidden' && salary !== 'Competitive Pay';
  const hasLocation = location !== 'Remote / On-site';

  // Bundled with the function, not fetched. See app/api/og/_logo.ts.
  const logoSrc = LOGO_DATA_URI;

  const middle = isHomepage ? (
    /* ===== HOMEPAGE ===== */
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          fontSize: 66,
          fontWeight: 800,
          color: INK,
          lineHeight: 1.08,
          letterSpacing: '-0.02em',
          maxWidth: 980,
        }}
      >
        The PMHNP-Only Job Board
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: 28,
          fontWeight: 500,
          color: MUTED,
          lineHeight: 1.45,
          marginTop: 20,
          maxWidth: 860,
        }}
      >
        Psychiatric nurse practitioner jobs with salary transparency. Remote and in-person roles across all 50 states, updated daily.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginTop: 36 }}>
        {chip('Salary transparency', true)}
        {chip('All 50 states')}
        {chip('Updated daily')}
      </div>
    </div>
  ) : isPageType ? (
    /* ===== PAGE / CATEGORY ===== */
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'block',
          lineClamp: 2,
          fontSize: titleFontSize(displayTitle),
          fontWeight: 800,
          color: INK,
          lineHeight: 1.12,
          letterSpacing: '-0.02em',
          maxWidth: 1040,
        }}
      >
        {displayTitle}
      </div>
      {subtitle && (
        <div
          style={{
            display: 'flex',
            fontSize: 28,
            fontWeight: 500,
            color: MUTED,
            lineHeight: 1.45,
            marginTop: 20,
            maxWidth: 900,
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  ) : hasSalary ? (
    /* ===== JOB POST, pay published ===== */
    /* The advertised range is the dominant element on the card. Two
       reasons. It is the one fact a reader cannot get from the headline of
       any competing board, and it is the only element that stays legible at
       the ~180px a link preview gets in a feed, where a two-line role title
       resolves to a grey smear.

       Size and color carry the hierarchy here, never fontWeight. next/og
       registers a single face (Noto Sans Regular, declared as weight 700),
       and Satori does no synthetic emboldening, so 800 and 500 rasterise
       identically. Asking for weight contrast would produce none. */
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          fontSize: salaryFontSize(salary),
          color: INK,
          lineHeight: 1,
          letterSpacing: '-0.03em',
        }}
      >
        {salary}
      </div>
      <div
        style={{
          display: 'block',
          lineClamp: 2,
          fontSize: 42,
          color: INK,
          lineHeight: 1.16,
          letterSpacing: '-0.015em',
          marginTop: 26,
          maxWidth: 1010,
        }}
      >
        {displayTitle}
      </div>
      <div style={{ display: 'flex', fontSize: 27, color: MUTED, marginTop: 14 }}>
        at {displayCompany}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginTop: 28 }}>
        {hasLocation && chip(location)}
        {jobType && chip(jobType)}
        {experience && chip(experience)}
      </div>
    </div>
  ) : (
    /* ===== JOB POST, pay withheld ===== */
    /* No slab to fall back on, so the title takes the dominant position and
       the chips carry what is left. Inventing a placeholder figure here
       would put a number on the card that the posting never published. */
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'block',
          lineClamp: 2,
          fontSize: titleFontSize(displayTitle),
          fontWeight: 800,
          color: INK,
          lineHeight: 1.12,
          letterSpacing: '-0.02em',
          maxWidth: 1040,
        }}
      >
        {displayTitle}
      </div>
      <div style={{ display: 'flex', fontSize: 30, fontWeight: 600, color: MUTED, marginTop: 18 }}>
        at {displayCompany}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginTop: 34 }}>
        {hasLocation && chip(location)}
        {jobType && chip(jobType)}
        {experience && chip(experience)}
      </div>
    </div>
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: CREAM,
          color: INK,
          fontFamily: 'sans-serif',
        }}
      >
        {/* Top accent rule */}
        <div style={{ display: 'flex', width: '100%', height: 8, backgroundColor: TEAL }} />

        <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, padding: '52px 64px 44px' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div style={{ display: 'flex', fontSize: 22, fontWeight: 700, letterSpacing: '0.24em', color: TEAL }}>
              PMHNP HIRING
            </div>
            {/* Badge text tracks the flag it renders. The caller sets isNew
                from createdAt being under 7 days old; it said "Featured",
                which on this board is a paid and editorial placement, so
                every freshly ingested aggregator job advertised a promotion
                it had not been given. */}
            {!isHomepage && !isPageType && isNew && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px 24px',
                  borderRadius: 999,
                  backgroundColor: TEAL,
                  color: '#FFFFFF',
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                }}
              >
                New
              </div>
            )}
          </div>

          {/* Main content */}
          <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center' }}>
            {middle}
          </div>

          {/* Bottom bar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '100%',
              borderTop: `1px solid ${BORDER}`,
              paddingTop: 26,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {logoSrc ? (
                <img src={logoSrc} alt="PMHNP Hiring" width={150} height={50} style={{ objectFit: 'contain' }} />
              ) : (
                <div style={{ display: 'flex', fontSize: 24, fontWeight: 800, color: INK }}>PMHNP Hiring</div>
              )}
            </div>
            <div style={{ display: 'flex', fontSize: 22, fontWeight: 700, color: TEAL }}>
              pmhnphiring.com
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        // Cache rendered OG image at the edge for 30 days; revalidate within 1 day in background.
        // Each unique query-string combination is cached separately (Vercel keys by URL).
        'Cache-Control': 'public, immutable, max-age=0, s-maxage=2592000, stale-while-revalidate=86400',
        'CDN-Cache-Control': 'public, max-age=2592000',
        'Vercel-CDN-Cache-Control': 'public, max-age=2592000',
      },
    }
  );
}
