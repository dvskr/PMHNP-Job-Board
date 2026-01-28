import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const title = searchParams.get('title') || 'PMHNP Job Opportunity';
  const company = searchParams.get('company') || 'Healthcare Organization';
  const location = searchParams.get('location') || 'United States';
  const salary = searchParams.get('salary') || '';
  const mode = searchParams.get('mode') || '';
  const jobType = searchParams.get('jobType') || '';

  const typeValue = [mode, jobType].filter(Boolean).join(', ') || 'Full-Time';

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#ffffff',
          padding: '56px 64px',
          position: 'relative',
          overflow: 'hidden',
          justifyContent: 'space-between',
        }}
      >
        {/* Background Watermark */}
        <div
          style={{
            position: 'absolute',
            right: '-40px',
            top: '50%',
            transform: 'translateY(-50%) rotate(-90deg)',
            fontSize: '200px',
            fontWeight: 900,
            color: '#f1f5f9',
            letterSpacing: '-8px',
            display: 'flex',
          }}
        >
          PMHNP
        </div>

        {/* Top Section */}
        <div style={{ display: 'flex', flexDirection: 'column', zIndex: 1 }}>
          {/* Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '32px',
            }}
          >
            <div
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: '#1e40af',
                textTransform: 'uppercase',
                letterSpacing: '3px',
                display: 'flex',
              }}
            >
              PMHNP HIRING
            </div>
            <div
              style={{
                background: '#fef2f2',
                color: '#dc2626',
                padding: '10px 20px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '1px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              🔥 NOW HIRING
            </div>
          </div>

          {/* Job Title */}
          <div
            style={{
              fontSize: title.length > 30 ? '56px' : '68px',
              fontWeight: 900,
              color: '#0f172a',
              lineHeight: 1.05,
              marginBottom: '16px',
              display: 'flex',
              maxWidth: '80%',
            }}
          >
            {title.length > 40 ? title.substring(0, 40) + '...' : title}
          </div>

          {/* Company */}
          <div
            style={{
              fontSize: '30px',
              color: '#64748b',
              fontWeight: 500,
              display: 'flex',
            }}
          >
            {company.length > 35 ? company.substring(0, 35) + '...' : company}
          </div>
        </div>

        {/* Bottom Section */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            zIndex: 1,
          }}
        >
          {/* Info Tags */}
          <div style={{ display: 'flex', gap: '48px' }}>
            {/* Location */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span
                style={{
                  fontSize: '13px',
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  letterSpacing: '1.5px',
                  marginBottom: '8px',
                  fontWeight: 600,
                }}
              >
                LOCATION
              </span>
              <span style={{ fontSize: '22px', fontWeight: 700, color: '#1e293b' }}>
                {location}
              </span>
            </div>

            {/* Salary */}
            {salary && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span
                  style={{
                    fontSize: '13px',
                    color: '#94a3b8',
                    textTransform: 'uppercase',
                    letterSpacing: '1.5px',
                    marginBottom: '8px',
                    fontWeight: 600,
                  }}
                >
                  SALARY
                </span>
                <span style={{ fontSize: '22px', fontWeight: 700, color: '#059669' }}>
                  {salary}
                </span>
              </div>
            )}

            {/* Type */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span
                style={{
                  fontSize: '13px',
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  letterSpacing: '1.5px',
                  marginBottom: '8px',
                  fontWeight: 600,
                }}
              >
                TYPE
              </span>
              <span style={{ fontSize: '22px', fontWeight: 700, color: '#1e293b' }}>
                {typeValue}
              </span>
            </div>
          </div>

          {/* Website Badge */}
          <div
            style={{
              background: '#0f172a',
              color: 'white',
              padding: '18px 36px',
              borderRadius: '12px',
              fontSize: '20px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            pmhnphiring.com
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
