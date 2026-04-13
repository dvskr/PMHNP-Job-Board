'use client';

import Link from 'next/link';
import Image from 'next/image';

type AuthVariant = 'login' | 'signup' | 'forgot' | 'reset' | 'employer_login' | 'employer_signup';

interface AuthLayoutProps {
  variant: AuthVariant;
  children: React.ReactNode;
}

const VARIANT_CONFIG: Record<AuthVariant, {
  headline: string;
  subline: string;
  illustration: string;
  testimonial: { quote: string; name: string; title: string } | null;
  rightLink: { label: string; href: string } | null;
}> = {
  login: {
    headline: 'Welcome back',
    subline: 'Sign in to your account',
    illustration: '/illustrations/auth-login.png',
    testimonial: {
      quote: '"I found my dream remote PMHNP position in less than a week. The job matching was incredibly accurate."',
      name: 'Sarah M., PMHNP-BC',
      title: 'Austin, TX',
    },
    rightLink: { label: 'Browse Jobs →', href: '/jobs' },
  },
  signup: {
    headline: 'Create your account',
    subline: 'Join thousands of PMHNPs finding their perfect role',
    illustration: '/illustrations/auth-signup.png',
    testimonial: {
      quote: '"Setting up my profile took 2 minutes, and I was getting matched with relevant positions the same day."',
      name: 'James R., PMHNP',
      title: 'Denver, CO',
    },
    rightLink: { label: 'Browse Jobs →', href: '/jobs' },
  },
  forgot: {
    headline: 'Reset your password',
    subline: "Enter your email and we'll send you a reset link",
    illustration: '/illustrations/auth-forgot.png',
    testimonial: null,
    rightLink: null,
  },
  reset: {
    headline: 'Set new password',
    subline: 'Choose a strong password to secure your account',
    illustration: '/illustrations/auth-forgot.png',
    testimonial: null,
    rightLink: null,
  },
  employer_login: {
    headline: 'Employer Login',
    subline: 'Manage your job listings and applicants',
    illustration: '/illustrations/auth-employer.png',
    testimonial: {
      quote: '"We filled three PMHNP positions in under two weeks. The candidate quality was outstanding compared to general job boards."',
      name: 'Dr. Lisa Chen',
      title: 'HR Director',
    },
    rightLink: { label: 'Post a Job →', href: '/post-job' },
  },
  employer_signup: {
    headline: 'Create Employer Account',
    subline: 'Start hiring qualified PMHNPs today',
    illustration: '/illustrations/auth-employer-signup.png',
    testimonial: {
      quote: '"The specialized talent pool here is unmatched. We connected with board-certified PMHNPs who were ready to start immediately."',
      name: 'Mark R., MBA',
      title: 'Chief Operating Officer',
    },
    rightLink: { label: 'Learn More →', href: '/for-employers' },
  },
};

export default function AuthLayout({ variant, children }: AuthLayoutProps) {
  const config = VARIANT_CONFIG[variant];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#FAFBF8' }}>

      {/* ═══ LEFT — Form ═══ */}
      <div style={{
        width: '100%',
        maxWidth: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '32px 28px',
        minHeight: '100vh',
        overflowY: 'auto',
      }}
        className="lg:!w-[45%] lg:!max-w-[45%]"
      >
        {/* Logo */}
        <Link
          href="/"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            textDecoration: 'none', marginBottom: '48px',
          }}
        >
          <Image src="/logo.png" alt="PMHNP Hiring" width={30} height={30} style={{ borderRadius: '6px' }} />
          <span style={{
            fontSize: '14px', fontWeight: 700,
            color: '#1A2E35', letterSpacing: '-0.3px',
          }}>
            PMHNP Hiring
          </span>
        </Link>

        {/* Form wrapper — vertically centered */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          maxWidth: '380px',
          width: '100%',
          margin: '0 auto',
        }}>
          {/* Heading */}
          <h1 style={{
            fontSize: '28px',
            fontWeight: 700,
            color: '#1A2E35',
            fontFamily: 'var(--font-lora), Georgia, serif',
            lineHeight: 1.2,
            letterSpacing: '-0.5px',
            margin: 0,
          }}>
            {config.headline}
          </h1>
          <p style={{
            fontSize: '14px',
            color: '#6B7F8A',
            marginTop: '8px',
            marginBottom: '28px',
            lineHeight: 1.5,
          }}>
            {config.subline}
          </p>

          {/* Form content — clay themed */}
          <div className="auth-clay">
            {children}
          </div>
        </div>

        {/* Footer terms */}
        <p style={{
          fontSize: '11px',
          color: '#9CA3AF',
          marginTop: '32px',
          lineHeight: 1.6,
        }}>
          By continuing, you agree to our{' '}
          <Link href="/terms" style={{ color: '#6B7F8A', textDecoration: 'underline' }}>Terms of Service</Link>
          {' '}and{' '}
          <Link href="/privacy" style={{ color: '#6B7F8A', textDecoration: 'underline' }}>Privacy Policy</Link>
        </p>
      </div>

      {/* ═══ RIGHT — Social Proof / Illustration (hidden mobile) ═══ */}
      <div
        className="hidden lg:flex"
        style={{
          width: '55%',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          position: 'relative',
          background: '#E8F5F0',
          borderLeft: '1px solid #D5E8E0',
          padding: '48px',
          overflow: 'hidden',
        }}
      >
        {/* Top-right link */}
        {config.rightLink && (
          <Link
            href={config.rightLink.href}
            style={{
              position: 'absolute', top: '28px', right: '32px',
              fontSize: '13px', fontWeight: 600,
              color: '#0D9488',
              textDecoration: 'none',
              padding: '6px 14px',
              borderRadius: '8px',
              border: '1px solid rgba(13,148,136,0.2)',
              background: 'rgba(255,255,255,0.6)',
              backdropFilter: 'blur(8px)',
              transition: 'all 0.15s ease',
            }}
          >
            {config.rightLink.label}
          </Link>
        )}

        {/* Illustration */}
        <div style={{
          width: '100%',
          maxWidth: '440px',
          borderRadius: '20px',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
        }}>
          <Image
            src={config.illustration}
            alt=""
            width={440}
            height={275}
            style={{ width: '100%', height: 'auto', display: 'block' }}
            priority
          />
        </div>

        {/* Testimonial */}
        {config.testimonial && (
          <div style={{
            maxWidth: '420px',
            marginTop: '36px',
            position: 'relative',
          }}>
            {/* Quote mark */}
            <div style={{
              fontSize: '64px',
              fontFamily: 'Georgia, serif',
              color: '#0D9488',
              lineHeight: 0.5,
              marginBottom: '8px',
              opacity: 0.3,
            }}>
              "
            </div>
            <p style={{
              fontSize: '18px',
              fontWeight: 500,
              color: '#1A2E35',
              lineHeight: 1.65,
              fontStyle: 'italic',
              fontFamily: 'var(--font-lora), Georgia, serif',
              margin: 0,
            }}>
              {config.testimonial.quote}
            </p>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginTop: '20px',
            }}>
              {/* Avatar placeholder */}
              <div style={{
                width: '40px', height: '40px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #0D9488 0%, #5EEAD4 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', fontWeight: 700, color: '#fff',
                flexShrink: 0,
              }}>
                {config.testimonial.name.charAt(0)}
              </div>
              <div>
                <div style={{
                  fontSize: '14px', fontWeight: 600,
                  color: '#1A2E35',
                }}>
                  {config.testimonial.name}
                </div>
                <div style={{
                  fontSize: '12px',
                  color: '#6B7F8A',
                }}>
                  {config.testimonial.title}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Decorative dots */}
        <div style={{
          position: 'absolute', bottom: '32px', left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: '6px',
        }}>
          {[0,1,2].map(i => (
            <div key={i} style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: i === 0 ? '#0D9488' : '#C5DDD5',
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}
