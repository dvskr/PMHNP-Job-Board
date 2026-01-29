import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

// CRITICAL: Edge runtime for speed
export const runtime = 'edge';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Get parameters with defaults
    const title = searchParams.get('title') || 'PMHNP Position';
    const company = searchParams.get('company') || 'Healthcare Employer';
    let salary = searchParams.get('salary') || '';
    const location = searchParams.get('location') || '';

    // CRITICAL: Remove $0k salaries even if they somehow get passed
    if (salary.includes('$0k') || salary.includes('$0-') || salary === '$0') {
      salary = '';
    }
    const mode = searchParams.get('mode') || '';
    const jobType = searchParams.get('jobType') || '';
    const isNew = searchParams.get('isNew') === 'true';

    const typeValue = [mode, jobType].filter(Boolean).join(', ') || 'Full-Time';

    // Truncate long text
    const displayTitle = title.length > 45 ? title.slice(0, 45) + '...' : title;
    const displayCompany = company.length > 30 ? company.slice(0, 30) + '...' : company;

    // Build info line - exclude empty or zero salaries (e.g., "$0k-$0k", "$0", "0")
    // Check if salary contains at least one non-zero digit
    const isValidSalary = salary && /[1-9]/.test(salary);
    const infoParts: string[] = [];
    if (isValidSalary) infoParts.push(salary);
    if (location) infoParts.push(location);
    if (typeValue) infoParts.push(typeValue);
    const infoLine = infoParts.join('  •  ');

    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#0f172a',
            padding: '56px 64px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          {/* Header Row */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '100%',
            }}
          >
            {/* Logo + Brand */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '52px',
                  height: '52px',
                  backgroundColor: '#14b8a6',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ color: 'white', fontSize: '28px', fontWeight: 700 }}>P</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ color: '#14b8a6', fontSize: '24px', fontWeight: 700, letterSpacing: '0.05em' }}>
                  PMHNP
                </span>
                <span style={{ color: '#14b8a6', fontSize: '16px', fontWeight: 600, letterSpacing: '0.15em', marginTop: '-4px' }}>
                  HIRING
                </span>
              </div>
            </div>

            {/* NEW Badge */}
            {isNew && (
              <div
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  color: '#f87171',
                  padding: '10px 20px',
                  borderRadius: '24px',
                  fontSize: '16px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                🔥 NEW
              </div>
            )}
          </div>

          {/* Divider */}
          <div
            style={{
              width: '100%',
              height: '2px',
              backgroundColor: '#334155',
              marginTop: '40px',
              marginBottom: '40px',
            }}
          />

          {/* Job Title */}
          <h1
            style={{
              color: '#ffffff',
              fontSize: '56px',
              fontWeight: 800,
              margin: 0,
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
            }}
          >
            {displayTitle}
          </h1>

          {/* Company Name */}
          <p
            style={{
              color: '#94a3b8',
              fontSize: '28px',
              fontWeight: 600,
              margin: 0,
              marginTop: '16px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {displayCompany}
          </p>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Bottom Row */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              width: '100%',
            }}
          >
            {/* Info Line */}
            <p
              style={{
                color: '#e2e8f0',
                fontSize: '24px',
                fontWeight: 500,
                margin: 0,
              }}
            >
              {infoLine}
            </p>

            {/* Website */}
            <p
              style={{
                color: '#64748b',
                fontSize: '18px',
                fontWeight: 500,
                margin: 0,
              }}
            >
              pmhnphiring.com
            </p>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        // CRITICAL: Cache headers for speed
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=2592000',
          'CDN-Cache-Control': 'public, max-age=604800',
          'Vercel-CDN-Cache-Control': 'public, max-age=604800',
        },
      }
    );
  } catch (error) {
    console.error('OG Image Error:', error);

    // Return a simple fallback on error
    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0f172a',
            color: '#14b8a6',
            fontSize: '48px',
            fontWeight: 700,
          }}
        >
          PMHNP HIRING
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }
}
