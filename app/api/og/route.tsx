import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Get dynamic parameters
  const title = searchParams.get('title');
  const type = searchParams.get('type'); // 'page' for category/blog/location pages
  const subtitle = searchParams.get('subtitle') || '';
  const company = searchParams.get('company') || 'PMHNP Hiring';
  const salary = searchParams.get('salary') || 'Competitive Pay';
  const location = searchParams.get('location') || 'Remote / On-site';
  const jobType = searchParams.get('jobType') || 'Full-time';
  const isNew = searchParams.get('isNew') === 'true';
  const isHomepage = !title && type !== 'page';
  const isPageType = type === 'page';
  const displayTitle = title
    ? (title.length > 55 ? title.slice(0, 52) + '...' : title)
    : '';
  const domain = 'PMHNPHIRING.COM';



  // Fetch Logo
  let logoSrc = '';
  try {
    const host = request.headers.get('host') || 'pmhnphiring.com';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const logoRes = await fetch(`${protocol}://${host}/pmhnp_logo.png`);
    if (logoRes.ok) {
      const logoBuf = await logoRes.arrayBuffer();
      logoSrc = `data:image/png;base64,${Buffer.from(logoBuf).toString('base64')}`;
    }
  } catch (e) {
    console.error('Failed to fetch logo:', e);
    // Fallback to emptyString or proceed without logo
  }

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#0A1120',
          color: 'white',
          fontFamily: '"Inter", "SF Pro Display", "system-ui", "Segoe UI", "Roboto", sans-serif',
          padding: '48px 56px',
          boxSizing: 'border-box',
          position: 'relative',
        }}
      >
        {/* 1. Background Gradient (Absolute, First in DOM = Bottom) */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            background: 'radial-gradient(circle at top right, #1e293b 0%, #020617 60%)',
            display: 'flex',
          }}
        />

        {/* 2. Abstract Texture (Absolute) */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundImage: 'radial-gradient(rgba(16, 185, 129, 0.15) 2px, transparent 2px)',
            backgroundSize: '40px 40px',
            display: 'flex',
            opacity: 0.4,
          }}
        />

        {/* 3. Glow Border (Absolute) */}
        <div
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            bottom: '16px',
            left: '16px',
            borderRadius: '24px',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            boxShadow: '0 0 40px rgba(16, 185, 129, 0.1)',
            display: 'flex',
          }}
        />

        {/* 4. Main Content Wrapper (Relative, Last in DOM = Top) */}
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', position: 'relative' }}>

          {isHomepage ? (
            /* ===== HOMEPAGE / BRAND OG IMAGE ===== */
            <>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  {logoSrc ? (
                    <img src={logoSrc} height="80" style={{ objectFit: 'contain' }} alt="PMHNP Hiring" />
                  ) : (
                    <div style={{ display: 'flex', fontSize: 28, fontWeight: 800, color: '#2DD4BF', textShadow: '0 0 20px rgba(45, 212, 191, 0.5)' }}>PMHNP Hiring</div>
                  )}
                </div>
                <div style={{
                  display: 'flex',
                  fontSize: '20px',
                  fontWeight: 700,
                  color: '#2DD4BF',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                }}>
                  {domain}
                </div>
              </div>

              {/* Main headline */}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, gap: '20px' }}>
                <div style={{
                  display: 'flex',
                  fontSize: '64px',
                  fontWeight: 900,
                  color: 'white',
                  lineHeight: 1.05,
                  letterSpacing: '-0.03em',
                  textShadow: '0 4px 12px rgba(0,0,0,0.5)',
                }}>
                  The #1 PMHNP Job Board
                </div>
                <div style={{
                  display: 'flex',
                  fontSize: '28px',
                  fontWeight: 500,
                  color: '#94a3b8',
                  lineHeight: 1.4,
                }}>
                  Find psychiatric nurse practitioner jobs with salary transparency. Remote &amp; in-person positions updated daily.
                </div>
              </div>

              {/* Stats row */}
              <div style={{
                display: 'flex',
                gap: '0px',
                width: '100%',
                borderTop: '2px solid rgba(51, 65, 85, 0.5)',
                paddingTop: '32px',
              }}>
                {[
                  { number: '10,000+', label: 'PMHNP Jobs' },
                  { number: '3,000+', label: 'Companies' },
                  { number: '50', label: 'States' },
                ].map((stat, i) => (
                  <div key={stat.label} style={{
                    display: 'flex',
                    flex: 1,
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    borderRight: i < 2 ? '2px solid rgba(51, 65, 85, 0.5)' : 'none',
                  }}>
                    <div style={{
                      display: 'flex',
                      fontSize: '48px',
                      fontWeight: 900,
                      color: '#2DD4BF',
                      textShadow: '0 0 30px rgba(45, 212, 191, 0.3)',
                    }}>
                      {stat.number}
                    </div>
                    <div style={{
                      display: 'flex',
                      fontSize: '18px',
                      fontWeight: 700,
                      color: '#64748b',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                    }}>
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : isPageType ? (
            /* ===== PAGE / CATEGORY OG IMAGE ===== */
            <>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  {logoSrc ? (
                    <img src={logoSrc} height="80" style={{ objectFit: 'contain' }} alt="PMHNP Hiring" />
                  ) : (
                    <div style={{ display: 'flex', fontSize: 28, fontWeight: 800, color: '#2DD4BF', textShadow: '0 0 20px rgba(45, 212, 191, 0.5)' }}>PMHNP Hiring</div>
                  )}
                </div>
                <div style={{
                  display: 'flex',
                  fontSize: '20px',
                  fontWeight: 700,
                  color: '#2DD4BF',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                }}>
                  {domain}
                </div>
              </div>

              {/* Page title */}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, gap: '16px' }}>
                <div style={{
                  display: 'flex',
                  fontSize: displayTitle.length > 35 ? '52px' : '60px',
                  fontWeight: 900,
                  color: 'white',
                  lineHeight: 1.1,
                  letterSpacing: '-0.03em',
                  textShadow: '0 4px 12px rgba(0,0,0,0.5)',
                }}>
                  {displayTitle}
                </div>
                {subtitle && (
                  <div style={{
                    display: 'flex',
                    fontSize: '28px',
                    fontWeight: 500,
                    color: '#94a3b8',
                    lineHeight: 1.4,
                  }}>
                    {subtitle}
                  </div>
                )}
              </div>

              {/* Bottom bar */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                borderTop: '2px solid rgba(51, 65, 85, 0.5)',
                paddingTop: '24px',
              }}>
                <div style={{
                  display: 'flex',
                  padding: '8px 20px',
                  backgroundColor: 'rgba(45, 212, 191, 0.15)',
                  border: '1px solid rgba(45, 212, 191, 0.3)',
                  borderRadius: '8px',
                  fontSize: '20px',
                  fontWeight: 700,
                  color: '#2DD4BF',
                }}>
                  pmhnphiring.com
                </div>
                <div style={{
                  display: 'flex',
                  fontSize: '20px',
                  fontWeight: 600,
                  color: '#64748b',
                }}>
                  The #1 PMHNP Job Board
                </div>
              </div>
            </>
          ) : (
            /* ===== JOB POST OG IMAGE ===== */
            <>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', height: '128px', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  {logoSrc ? (
                    <img src={logoSrc} height="100" style={{ objectFit: 'contain' }} alt="PMHNP Hiring" />
                  ) : (
                    <div style={{ display: 'flex', fontSize: 32, fontWeight: 800, color: '#2DD4BF', textShadow: '0 0 20px rgba(45, 212, 191, 0.5)' }}>PMHNP Hiring</div>
                  )}
                </div>

                {isNew && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      backgroundColor: '#C2410C',
                      color: 'white',
                      padding: '8px 24px',
                      borderRadius: '6px',
                      fontSize: '24px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      marginTop: '8px',
                      border: '2px solid #F97316',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
                      transform: 'rotate(-2deg)',
                    }}
                  >
                    Featured
                  </div>
                )}
              </div>

              {/* Content Body */}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, gap: '12px' }}>
                <div
                  style={{
                    display: 'flex',
                    fontSize: '60px',
                    fontWeight: 800,
                    color: 'white',
                    lineHeight: 1.1,
                    textTransform: 'uppercase',
                    letterSpacing: '-0.025em',
                    textShadow: '0 4px 6px rgba(0,0,0,0.5)',
                  }}
                >
                  {displayTitle}
                </div>

                <div style={{ display: 'flex', marginTop: '16px' }}>
                  <div
                    style={{
                      display: 'flex',
                      fontSize: '30px',
                      fontWeight: 700,
                      color: '#2DD4BF',
                      textTransform: 'uppercase',
                      letterSpacing: '0.025em',
                      borderBottom: '4px solid #2DD4BF',
                      paddingBottom: '4px',
                      boxShadow: '0 4px 0 -2px rgba(45, 212, 191, 0.3)'
                    }}
                  >
                    {domain}
                  </div>
                </div>
              </div>

              {/* Footer / Stats Grid */}
              <div
                style={{
                  display: 'flex',
                  paddingTop: '32px',
                  borderTop: '2px solid rgba(51, 65, 85, 0.5)',
                  gap: '16px',
                  width: '100%',
                }}
              >
                {[
                  {
                    label: 'TYPE',
                    value: jobType,
                    icon: (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
                    ),
                  },
                  {
                    label: 'EMPLOYER',
                    value: company,
                    icon: (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" /><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" /><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" /><path d="M10 6h4" /><path d="M10 10h4" /><path d="M10 14h4" /><path d="M10 18h4" /></svg>
                    ),
                  },
                  // Only show salary if it's not empty, 0, or "Hidden"
                  ...(salary && salary !== '0' && salary !== 'Hidden' && salary !== 'Competitive Pay' ? [{
                    label: 'SALARY',
                    value: salary,
                    icon: (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="2" y2="22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                    ),
                  }] : []),
                  // Only show location if it's not empty or "Remote / On-site" placeholder
                  ...(location && location !== 'Remote / On-site' ? [{
                    label: 'LOCATION',
                    value: location,
                    icon: (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                    ),
                  }] : []),
                ].map((stat, i, arr) => (
                  <div key={stat.label} style={{ display: 'flex', flex: 1, alignItems: 'center' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '18px', fontWeight: 700, textTransform: 'uppercase' }}>
                        {stat.icon}
                        <span>{stat.label}</span>
                      </div>
                      <div style={{ display: 'flex', fontSize: '30px', fontWeight: 900, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {stat.value}
                      </div>
                    </div>
                    {/* Divider (except for last item) */}
                    {i < arr.length - 1 && (
                      <div style={{ display: 'flex', width: '2px', height: '100%', backgroundColor: 'rgba(51, 65, 85, 0.5)', marginLeft: '16px' }} />
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
