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
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#0A1120',
          color: 'white',
          fontFamily: 'sans-serif',
          padding: '48px 56px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background Gradient */}
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

        {/* Dot Texture */}
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

        {/* Glow Border */}
        <div
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            bottom: 16,
            left: 16,
            borderRadius: 24,
            border: '1px solid rgba(16, 185, 129, 0.3)',
            display: 'flex',
          }}
        />

        {/* Main Content */}
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>

          {isHomepage ? (
            /* ===== HOMEPAGE ===== */
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  {logoSrc ? (
                    <img src={logoSrc} width={200} height={70} style={{ objectFit: 'contain' }} />
                  ) : (
                    <div style={{ display: 'flex', fontSize: 28, fontWeight: 800, color: '#2DD4BF' }}>PMHNP Hiring</div>
                  )}
                </div>
                <div style={{
                  display: 'flex',
                  fontSize: 18,
                  fontWeight: 700,
                  color: '#2DD4BF',
                  letterSpacing: '0.1em',
                }}>
                  {domain}
                </div>
              </div>

              {/* Main headline */}
              <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center' }}>
                <div style={{
                  display: 'flex',
                  fontSize: 56,
                  fontWeight: 900,
                  color: 'white',
                  lineHeight: 1.1,
                  letterSpacing: '-0.02em',
                  maxWidth: 900,
                }}>
                  The #1 PMHNP Job Board
                </div>
                <div style={{
                  display: 'flex',
                  fontSize: 24,
                  fontWeight: 500,
                  color: '#94a3b8',
                  lineHeight: 1.4,
                  marginTop: 16,
                  maxWidth: 800,
                }}>
                  Find psychiatric nurse practitioner jobs with salary transparency. Remote &amp; in-person positions updated daily.
                </div>
              </div>

              {/* Stats row */}
              <div style={{
                display: 'flex',
                width: '100%',
                borderTop: '2px solid rgba(51, 65, 85, 0.5)',
                paddingTop: 24,
              }}>
                {[
                  { number: '10,000+', label: 'PMHNP Jobs' },
                  { number: '3,000+', label: 'Companies' },
                  { number: '50', label: 'States' },
                ].map((stat, i) => (
                  <div key={stat.label} style={{
                    display: 'flex',
                    flexGrow: 1,
                    flexDirection: 'column',
                    alignItems: 'center',
                    borderRight: i < 2 ? '2px solid rgba(51, 65, 85, 0.5)' : 'none',
                  }}>
                    <div style={{
                      display: 'flex',
                      fontSize: 42,
                      fontWeight: 900,
                      color: '#2DD4BF',
                    }}>
                      {stat.number}
                    </div>
                    <div style={{
                      display: 'flex',
                      fontSize: 16,
                      fontWeight: 700,
                      color: '#64748b',
                      letterSpacing: '0.1em',
                      marginTop: 4,
                    }}>
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : isPageType ? (
            /* ===== PAGE / CATEGORY ===== */
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  {logoSrc ? (
                    <img src={logoSrc} width={200} height={70} style={{ objectFit: 'contain' }} />
                  ) : (
                    <div style={{ display: 'flex', fontSize: 28, fontWeight: 800, color: '#2DD4BF' }}>PMHNP Hiring</div>
                  )}
                </div>
                <div style={{
                  display: 'flex',
                  fontSize: 18,
                  fontWeight: 700,
                  color: '#2DD4BF',
                  letterSpacing: '0.1em',
                }}>
                  {domain}
                </div>
              </div>

              {/* Page title */}
              <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center' }}>
                <div style={{
                  display: 'flex',
                  fontSize: displayTitle.length > 35 ? 48 : 56,
                  fontWeight: 900,
                  color: 'white',
                  lineHeight: 1.1,
                  letterSpacing: '-0.02em',
                  maxWidth: 1000,
                }}>
                  {displayTitle}
                </div>
                {subtitle && (
                  <div style={{
                    display: 'flex',
                    fontSize: 24,
                    fontWeight: 500,
                    color: '#94a3b8',
                    lineHeight: 1.4,
                    marginTop: 16,
                    maxWidth: 800,
                  }}>
                    {subtitle}
                  </div>
                )}
              </div>

              {/* Bottom bar */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                borderTop: '2px solid rgba(51, 65, 85, 0.5)',
                paddingTop: 20,
              }}>
                <div style={{
                  display: 'flex',
                  padding: '8px 20px',
                  backgroundColor: 'rgba(45, 212, 191, 0.15)',
                  border: '1px solid rgba(45, 212, 191, 0.3)',
                  borderRadius: 8,
                  fontSize: 18,
                  fontWeight: 700,
                  color: '#2DD4BF',
                }}>
                  pmhnphiring.com
                </div>
                <div style={{
                  display: 'flex',
                  fontSize: 18,
                  fontWeight: 600,
                  color: '#64748b',
                  marginLeft: 16,
                }}>
                  The #1 PMHNP Job Board
                </div>
              </div>
            </div>
          ) : (
            /* ===== JOB POST ===== */
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  {logoSrc ? (
                    <img src={logoSrc} width={200} height={80} style={{ objectFit: 'contain' }} />
                  ) : (
                    <div style={{ display: 'flex', fontSize: 28, fontWeight: 800, color: '#2DD4BF' }}>PMHNP Hiring</div>
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
                      borderRadius: 6,
                      fontSize: 22,
                      fontWeight: 700,
                      border: '2px solid #F97316',
                    }}
                  >
                    Featured
                  </div>
                )}
              </div>

              {/* Content Body */}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flexGrow: 1 }}>
                <div
                  style={{
                    display: 'flex',
                    fontSize: 52,
                    fontWeight: 800,
                    color: 'white',
                    lineHeight: 1.1,
                    letterSpacing: '-0.02em',
                    maxWidth: 1000,
                  }}
                >
                  {displayTitle}
                </div>

                <div style={{ display: 'flex', marginTop: 16 }}>
                  <div
                    style={{
                      display: 'flex',
                      fontSize: 26,
                      fontWeight: 700,
                      color: '#2DD4BF',
                      letterSpacing: '0.025em',
                      borderBottom: '4px solid #2DD4BF',
                      paddingBottom: 4,
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
                  paddingTop: 24,
                  borderTop: '2px solid rgba(51, 65, 85, 0.5)',
                  width: '100%',
                }}
              >
                {[
                  {
                    label: 'TYPE',
                    value: jobType,
                    icon: (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
                    ),
                  },
                  {
                    label: 'EMPLOYER',
                    value: company,
                    icon: (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" /><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" /><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" /><path d="M10 6h4" /><path d="M10 10h4" /><path d="M10 14h4" /><path d="M10 18h4" /></svg>
                    ),
                  },
                  ...(salary && salary !== '0' && salary !== 'Hidden' && salary !== 'Competitive Pay' ? [{
                    label: 'SALARY',
                    value: salary,
                    icon: (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="2" y2="22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                    ),
                  }] : []),
                  ...(location && location !== 'Remote / On-site' ? [{
                    label: 'LOCATION',
                    value: location,
                    icon: (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                    ),
                  }] : []),
                ].map((stat, i, arr) => (
                  <div key={stat.label} style={{ display: 'flex', flexGrow: 1, alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', color: '#94a3b8', fontSize: 16, fontWeight: 700 }}>
                        {stat.icon}
                        <span style={{ marginLeft: 6 }}>{stat.label}</span>
                      </div>
                      <div style={{ display: 'flex', fontSize: 24, fontWeight: 900, color: 'white', marginTop: 4 }}>
                        {stat.value}
                      </div>
                    </div>
                    {i < arr.length - 1 && (
                      <div style={{ display: 'flex', width: 2, height: 50, backgroundColor: 'rgba(51, 65, 85, 0.5)', marginLeft: 12, marginRight: 12 }} />
                    )}
                  </div>
                ))}
              </div>
            </div>
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
