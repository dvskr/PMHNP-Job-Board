import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Load logo image
    const logoUrl = new URL('../../../public/pmhnp_logo.png', import.meta.url);
    const logoData = await fetch(logoUrl).then((res) => res.arrayBuffer());

    // Get parameters
    const title = searchParams.get('title') || 'PMHNP Position';
    const company = searchParams.get('company') || 'Healthcare Employer';
    let salary = searchParams.get('salary') || '';
    const location = searchParams.get('location') || '';
    const jobType = searchParams.get('jobType') || '';
    const isNew = searchParams.get('isNew') === 'true';

    // CRITICAL: Remove $0k salaries even if they somehow get passed
    if (salary.includes('$0k') || salary.includes('$0-') || salary === '$0') {
      salary = '';
    }

    // Truncate title if too long (for 2 lines max)
    const displayTitle = title.length > 50 ? title.slice(0, 50) + '...' : title;
    const displayCompany = company.length > 45 ? company.slice(0, 45) + '...' : company;

    // Build info line - skip empty/invalid values
    const infoParts: string[] = [];
    if (salary && !salary.includes('$0k') && /[1-9]/.test(salary)) {
      infoParts.push(salary);
    }
    if (location) {
      infoParts.push(location);
    }
    if (jobType) {
      infoParts.push(jobType);
    }
    const infoLine = infoParts.length > 0 ? infoParts.join('  •  ') : '';

    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: '#0f172a',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '56px 80px',
            textAlign: 'center',
            position: 'relative',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          {/* Brand - Top Left */}
          <div
            style={{
              position: 'absolute',
              top: '48px',
              left: '56px',
              display: 'flex',
              alignItems: 'center',
              gap: '20px',
            }}
          >
            {/* @ts-ignore */}
            <img
              src={logoData as any}
              width="64"
              height="64"
              style={{
                borderRadius: '12px',
              }}
            />
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <span
                style={{
                  fontSize: '28px',
                  fontWeight: 800,
                  color: '#0d9488',
                  letterSpacing: '1px',
                }}
              >
                PMHNP
              </span>
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#0d9488',
                  letterSpacing: '4px',
                }}
              >
                HIRING
              </span>
            </div>
          </div>

          {/* NEW Badge - Top Right */}
          {isNew && (
            <div
              style={{
                position: 'absolute',
                top: '48px',
                right: '56px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: '#f87171',
                padding: '12px 24px',
                borderRadius: '50px',
                fontSize: '18px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              🔥 NEW
            </div>
          )}

          {/* Top Divider */}
          <div
            style={{
              width: '140px',
              height: '5px',
              backgroundColor: '#0d9488',
              borderRadius: '3px',
              marginBottom: '44px',
            }}
          />

          {/* Job Title */}
          <h1
            style={{
              fontSize: '76px',
              fontWeight: 900,
              color: '#ffffff',
              margin: '0 0 20px 0',
              lineHeight: 1.05,
              letterSpacing: '-2px',
              textTransform: 'uppercase',
              maxWidth: '1000px',
            }}
          >
            {displayTitle}
          </h1>

          {/* Website - Prominent under title */}
          <p
            style={{
              color: '#0d9488',
              fontSize: '30px',
              fontWeight: 700,
              margin: '0 0 36px 0',
              letterSpacing: '3px',
            }}
          >
            PMHNPHIRING.COM
          </p>

          {/* Bottom Divider */}
          <div
            style={{
              width: '140px',
              height: '5px',
              backgroundColor: '#0d9488',
              borderRadius: '3px',
              marginBottom: '36px',
            }}
          />

          {/* Company Name */}
          <p
            style={{
              fontSize: '26px',
              color: '#94a3b8',
              margin: '0 0 16px 0',
              fontWeight: 500,
            }}
          >
            {displayCompany}
          </p>

          {/* Info Line */}
          {infoLine && (
            <p
              style={{
                fontSize: '24px',
                color: '#e2e8f0',
                margin: 0,
                fontWeight: 500,
              }}
            >
              {infoLine}
            </p>
          )}
        </div>
      ),
      {
        width: 1200,   // Standard OG image size
        height: 630,   // Standard OG image size
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=2592000',
        },
      }
    );
  } catch (error) {
    logger.error('OG Image Error:', error);

    // Fallback
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: '#0f172a',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <span style={{ color: '#0d9488', fontSize: '64px', fontWeight: 800 }}>
            PMHNP HIRING
          </span>
          <span style={{ color: '#94a3b8', fontSize: '32px', marginTop: '16px' }}>
            pmhnphiring.com
          </span>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }
}
