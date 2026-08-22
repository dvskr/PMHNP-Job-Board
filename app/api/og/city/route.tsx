import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

// ─── Shared OG visual system ────────────────────────────────────────────────
// Mirrored in app/api/og/route.tsx: warm cream ground, deep teal accent,
// near-black ink, pill chips, thin domain bottom bar. Satori constraints:
// flexbox only, explicit dims. Amber is reserved for the shortage badge.
const INK = '#1A2E35';
const CREAM = '#F7F5F0';
const TEAL = '#0D9488';
const TEAL_DARK = '#0F766E';
const TEAL_TINT = 'rgba(13, 148, 136, 0.10)';
const TEAL_EDGE = 'rgba(13, 148, 136, 0.35)';
const SURFACE = '#FFFFFF';
const BORDER = '#E4DED2';
const AMBER_TEXT = '#92400E';
const AMBER_TINT = '#FBEED7';
const AMBER_EDGE = '#EAD9B0';

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

/**
 * Dynamic OG image for pSEO city pages.
 * URL: /api/og/city?category=Remote&city=New+York,+NY&jobs=142&salary=$120K-$165K
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Query-param contract (unchanged): category, city, jobs, salary, shortage.
  // `v` is a cache buster only.
  const category = searchParams.get('category') || 'PMHNP';
  const city = searchParams.get('city') || 'United States';
  const jobs = searchParams.get('jobs') || '0';
  const salary = searchParams.get('salary') || '';
  const shortage = searchParams.get('shortage') === 'true';

  // Fetch logo
  let logoSrc = '';
  try {
    // Fixed origin — never the request Host header (attacker-controlled; using
    // it makes this OG route an SSRF proxy). The logo is a stable public asset.
    const logoRes = await fetch('https://pmhnphiring.com/pmhnp_logo.png');
    if (logoRes.ok) {
      const logoBuf = await logoRes.arrayBuffer();
      logoSrc = `data:image/png;base64,${Buffer.from(logoBuf).toString('base64')}`;
    }
  } catch { /* fallback text */ }

  // Truncate long city names
  const displayCity = city.length > 28 ? city.slice(0, 26) + '…' : city;

  const headlineLine1 = `${category} PMHNP Jobs`;
  const headlineLine2 = `in ${displayCity}`;
  const headlineSize = Math.max(headlineLine1.length, headlineLine2.length) > 26 ? 50 : 60;

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
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '10px 22px',
                borderRadius: 999,
                backgroundColor: TEAL_TINT,
                border: `1px solid ${TEAL_EDGE}`,
                color: TEAL_DARK,
                fontSize: 19,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase' as const,
              }}
            >
              {category} Jobs
            </div>
          </div>

          {/* Headline: category line in ink, city line in teal */}
          <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center' }}>
            <div
              style={{
                display: 'flex',
                fontSize: headlineSize,
                fontWeight: 800,
                color: INK,
                lineHeight: 1.08,
                letterSpacing: '-0.02em',
              }}
            >
              {headlineLine1}
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: headlineSize,
                fontWeight: 800,
                color: TEAL,
                lineHeight: 1.12,
                letterSpacing: '-0.02em',
                marginTop: 6,
              }}
            >
              {headlineLine2}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginTop: 36 }}>
              {chip(`${jobs} open positions`, true)}
              {salary && chip(`Salary: ${salary}`)}
              {shortage && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '12px 26px',
                    borderRadius: 999,
                    backgroundColor: AMBER_TINT,
                    border: `1px solid ${AMBER_EDGE}`,
                    color: AMBER_TEXT,
                    fontSize: 24,
                    fontWeight: 600,
                  }}
                >
                  Mental health shortage area
                </div>
              )}
            </div>
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
        'Cache-Control': 'public, immutable, max-age=0, s-maxage=2592000, stale-while-revalidate=86400',
        'CDN-Cache-Control': 'public, max-age=2592000',
        'Vercel-CDN-Cache-Control': 'public, max-age=2592000',
      },
    }
  );
}
