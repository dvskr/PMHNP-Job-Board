import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

/**
 * Dynamic OG image for pSEO city pages.
 * URL: /api/og/city?category=Remote&city=New+York,+NY&jobs=142&salary=$120K-$165K
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const category = searchParams.get('category') || 'PMHNP';
  const city = searchParams.get('city') || 'United States';
  const jobs = searchParams.get('jobs') || '0';
  const salary = searchParams.get('salary') || '';
  const shortage = searchParams.get('shortage') === 'true';

  // Fetch logo
  let logoSrc = '';
  try {
    const host = request.headers.get('host') || 'pmhnphiring.com';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const logoRes = await fetch(`${protocol}://${host}/pmhnp_logo.png`);
    if (logoRes.ok) {
      const logoBuf = await logoRes.arrayBuffer();
      logoSrc = `data:image/png;base64,${Buffer.from(logoBuf).toString('base64')}`;
    }
  } catch { /* fallback text */ }

  // Truncate long city names
  const displayCity = city.length > 28 ? city.slice(0, 26) + '…' : city;

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
          fontFamily: 'sans-serif',
          // Warm Diorama: cream/clay gradient
          background: 'linear-gradient(145deg, #FFF8F0 0%, #F5E6D3 40%, #FBEFE4 100%)',
          color: '#1F2947',
        }}
      >
        {/* Top accent bar */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '6px',
            display: 'flex',
            background: 'linear-gradient(90deg, #5EBCB0, #0D9488, #DB7558)',
          }}
        />

        {/* Subtle clay dot texture */}
        <div
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex',
            backgroundImage: 'radial-gradient(rgba(31,41,71,0.04) 1.5px, transparent 1.5px)',
            backgroundSize: '32px 32px',
          }}
        />

        {/* Decorative claymorphic circles */}
        <div style={{
          position: 'absolute', top: -60, right: -60,
          width: 280, height: 280, borderRadius: '50%',
          display: 'flex',
          background: 'linear-gradient(145deg, rgba(94,188,176,0.12), rgba(94,188,176,0.04))',
          boxShadow: 'inset 4px 4px 12px rgba(255,255,255,0.6), inset -4px -4px 12px rgba(0,0,0,0.03)',
        }} />
        <div style={{
          position: 'absolute', bottom: -40, left: -40,
          width: 200, height: 200, borderRadius: '50%',
          display: 'flex',
          background: 'linear-gradient(145deg, rgba(219,117,88,0.08), rgba(219,117,88,0.02))',
        }} />

        {/* Content */}
        <div style={{
          display: 'flex', flexDirection: 'column',
          width: '100%', height: '100%',
          padding: '48px 56px',
          position: 'relative',
        }}>

          {/* Header row */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
            marginBottom: 24,
          }}>
            {logoSrc ? (
              <img src={logoSrc} alt="PMHNP Hiring" width={180} height={60} style={{ objectFit: 'contain' }} />
            ) : (
              <div style={{ display: 'flex', fontSize: 26, fontWeight: 800, color: '#0D9488' }}>
                PMHNP Hiring
              </div>
            )}
            {/* Category badge */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 24px',
              borderRadius: '999px',
              background: 'linear-gradient(145deg, #FFFFFF, #F1E1CE)',
              border: '1px solid rgba(255,255,255,0.8)',
              boxShadow: '4px 4px 12px rgba(0,0,0,0.06), -2px -2px 8px rgba(255,255,255,0.8), inset 1px 1px 3px rgba(255,255,255,0.6)',
              fontSize: 16,
              fontWeight: 800,
              color: '#0D9488',
              letterSpacing: '0.06em',
              textTransform: 'uppercase' as const,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
              {category} Jobs
            </div>
          </div>

          {/* Main headline */}
          <div style={{
            display: 'flex', flexDirection: 'column',
            flexGrow: 1, justifyContent: 'center',
          }}>
            <div style={{
              display: 'flex',
              fontSize: displayCity.length > 20 ? 52 : 62,
              fontWeight: 800,
              color: '#1F2947',
              lineHeight: 1.05,
              letterSpacing: '-0.03em',
            }}>
              {category} PMHNP Jobs
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              marginTop: 8,
            }}>
              <div style={{
                display: 'flex',
                fontSize: displayCity.length > 20 ? 44 : 52,
                fontWeight: 800,
                color: '#0D9488',
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
              }}>
                in {displayCity}
              </div>
              {shortage && (
                <div style={{
                  display: 'flex',
                  padding: '6px 14px',
                  borderRadius: '8px',
                  background: '#FEF3C7',
                  border: '1px solid #FCD34D',
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#92400E',
                }}>
                  ⚕ Shortage Area
                </div>
              )}
            </div>
          </div>

          {/* Stats footer */}
          <div style={{
            display: 'flex',
            gap: '24px',
            paddingTop: 28,
            borderTop: '2px solid rgba(31,41,71,0.08)',
          }}>
            {/* Jobs count */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '16px',
              padding: '14px 28px',
              borderRadius: '18px',
              background: 'linear-gradient(145deg, #FFFFFF, #F5EDE2)',
              border: '1px solid rgba(255,255,255,0.5)',
              boxShadow: '4px 4px 12px rgba(0,0,0,0.05), -2px -2px 8px rgba(255,255,255,0.8), inset 1px 1px 3px rgba(255,255,255,0.6)',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 44, height: 44, borderRadius: 14,
                background: 'linear-gradient(145deg, #5EBCB0, #0D9488)',
                color: '#fff',
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 30, fontWeight: 900, color: '#1F2947', lineHeight: 1 }}>{jobs}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#8A9BA6', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
                  Open Positions
                </div>
              </div>
            </div>

            {/* Salary range */}
            {salary && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '16px',
                padding: '14px 28px',
                borderRadius: '18px',
                background: 'linear-gradient(145deg, #FFFFFF, #F5EDE2)',
                border: '1px solid rgba(255,255,255,0.5)',
                boxShadow: '4px 4px 12px rgba(0,0,0,0.05), -2px -2px 8px rgba(255,255,255,0.8), inset 1px 1px 3px rgba(255,255,255,0.6)',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 44, height: 44, borderRadius: 14,
                  background: 'linear-gradient(145deg, #DB7558, #C56B4E)',
                  color: '#fff',
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" x2="12" y1="2" y2="22" />
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: 26, fontWeight: 900, color: '#1F2947', lineHeight: 1 }}>{salary}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#8A9BA6', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
                    Salary Range
                  </div>
                </div>
              </div>
            )}

            {/* Domain pill */}
            <div style={{
              display: 'flex', alignItems: 'center',
              marginLeft: 'auto',
              padding: '14px 24px',
              borderRadius: '14px',
              background: 'linear-gradient(145deg, #0D9488, #0F766E)',
              color: '#fff',
              fontSize: 17,
              fontWeight: 800,
              letterSpacing: '0.05em',
              boxShadow: '4px 4px 12px rgba(13,148,136,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
            }}>
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
