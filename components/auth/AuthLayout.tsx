'use client';

import Link from 'next/link';
import Image from 'next/image';

/**
 * A first-party statement shown beside the form: a product fact or a live
 * platform number, said by the platform.
 *
 * Deliberately not called a testimonial. This prop WAS `testimonial`, and the
 * login page duly filled it with a quote attributed to a named clinician with
 * a credential and a city, who does not exist. A slot named for an endorsement
 * gets an endorsement written for it. This one can only hold something we can
 * stand behind.
 */
interface AuthPanelNote {
  /** The statement itself. */
  message: string;
  /** Who is saying it: the platform, never an individual we invented. */
  source: string;
  /** Short qualifier under the source, e.g. what kind of claim this is. */
  detail: string;
}

interface AuthLayoutProps {
  children: React.ReactNode;
  illustration?: string;
  note?: AuthPanelNote | null;
}

export default function AuthLayout({ children, illustration, note }: AuthLayoutProps) {
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
            {/* next/image serves a right-sized AVIF/WebP variant for this
                100px box instead of the browser downscaling the full
                logo.png. priority: above the fold on every auth page, same
                treatment as the Header logo. */}
            <Image
              src="/logo.png"
              alt="PMHNP Hiring"
              width={100}
              height={100}
              sizes="100px"
              priority
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

      {/* ═══ RIGHT — Illustration and first-party note (hidden mobile) ═══ */}
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
            <Image src={illustration} alt="" width={440} sizes="(max-width: 768px) 100vw, 440px" height={280}
              style={{ width: '100%', height: 'auto', display: 'block' }} priority />
          </div>
        )}

        {note && (
          <div style={{
            background: 'rgba(255,255,255,0.6)', borderRadius: '16px',
            border: '1px solid rgba(255,255,255,0.5)',
            maxWidth: '420px', marginTop: '24px', padding: '20px 24px',
          }}>
            {/* Not italicised: italic serif in a card with an avatar beside it
                is the visual grammar of a personal endorsement, which is how a
                product statement ends up being read as one. */}
            <p style={{
              fontSize: '15px', fontWeight: 500, color: '#2A4A5A',
              lineHeight: 1.65,
              fontFamily: 'var(--font-lora), Georgia, serif', margin: '0 0 12px',
            }}>
              {note.message}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '34px', height: '34px', borderRadius: '10px',
                background: 'linear-gradient(145deg, #0D9488, #10B981)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '13px', fontWeight: 700, color: '#fff', flexShrink: 0,
              }}>
                {note.source.charAt(0)}
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#1A2E35' }}>{note.source}</div>
                <div style={{ fontSize: '11px', color: '#4B5E68' }}>{note.detail}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
