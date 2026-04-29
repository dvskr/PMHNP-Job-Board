'use client';

import Link from 'next/link';
import Image from 'next/image';

interface AuthLayoutProps {
  children: React.ReactNode;
  illustration?: string;
  testimonial?: { quote: string; name: string; title: string } | null;
}

export default function AuthLayout({ children, illustration, testimonial }: AuthLayoutProps) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#F5F6F8' }}>

      {/* ═══ LEFT — Form Side ═══ */}
      <div style={{
        width: '100%',
        maxWidth: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '28px 28px 20px',
        minHeight: '100vh',
        overflowY: 'auto',
        background: '#F5F6F8',
      }}
        className="lg:!w-[50%] lg:!max-w-[50%]"
      >
        {/* Form area — vertically centered */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          maxWidth: '460px',
          width: '100%',
          margin: '0 auto',
        }}>
          {/* Logo — same as navbar */}
          <Link
            href="/"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              textDecoration: 'none', marginBottom: '4px', alignSelf: 'center',
            }}
          >
            <img
              src="/logo.png"
              alt="PMHNP Hiring"
              width="100"
              height="100"
              style={{ width: 100, height: 100, objectFit: 'contain', flexShrink: 0 }}
            />
            <span
              className="font-heading"
              style={{
                fontSize: '28px',
                fontWeight: 700,
                color: '#1F2937',
                letterSpacing: '-0.02em',
                whiteSpace: 'nowrap',
                lineHeight: 1,
                transform: 'translateY(4px)',
                marginLeft: '-24px',
              }}
            >
              PMHNP Hiring
            </span>
          </Link>

          {children}
        </div>

        {/* Footer */}
        <p style={{
          fontSize: '11px', color: '#9CA3AF',
          marginTop: '20px', lineHeight: 1.6, textAlign: 'center',
        }}>
          By continuing, you agree to our{' '}
          <Link href="/terms" style={{ color: '#0D9488', textDecoration: 'underline' }}>Terms</Link>
          {' '}and{' '}
          <Link href="/privacy" style={{ color: '#0D9488', textDecoration: 'underline' }}>Privacy Policy</Link>
        </p>
      </div>

      {/* ═══ RIGHT — Social Proof (hidden mobile) ═══ */}
      <div
        className="hidden lg:flex"
        style={{
          width: '50%',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          position: 'relative',
          background: 'linear-gradient(160deg, #E8F5F0 0%, #D5EDE5 50%, #C8E6D8 100%)',
          borderLeft: '1px solid rgba(255,255,255,0.6)',
          padding: '48px',
          overflow: 'hidden',
        }}
      >
        {illustration && (
          <div style={{
            width: '100%', maxWidth: '440px', borderRadius: '20px',
            overflow: 'hidden', border: '1px solid rgba(255,255,255,0.5)',
            boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
          }}>
            <Image src={illustration} alt="" width={440} height={280}
              style={{ width: '100%', height: 'auto', display: 'block' }} priority />
          </div>
        )}

        {testimonial && (
          <div style={{
            background: 'rgba(255,255,255,0.6)', borderRadius: '16px',
            border: '1px solid rgba(255,255,255,0.5)',
            maxWidth: '420px', marginTop: '24px', padding: '20px 24px',
          }}>
            <p style={{
              fontSize: '15px', fontWeight: 500, color: '#2A4A5A',
              lineHeight: 1.65, fontStyle: 'italic',
              fontFamily: 'var(--font-lora), Georgia, serif', margin: '0 0 12px',
            }}>
              {testimonial.quote}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '34px', height: '34px', borderRadius: '10px',
                background: 'linear-gradient(145deg, #0D9488, #10B981)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '13px', fontWeight: 700, color: '#fff', flexShrink: 0,
              }}>
                {testimonial.name.charAt(0)}
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#1A2E35' }}>{testimonial.name}</div>
                <div style={{ fontSize: '11px', color: '#6B7F8A' }}>{testimonial.title}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
