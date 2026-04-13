'use client';

import { useState } from 'react';

// Custom SVG icons for brand accuracy
const XIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const LinkedInIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

const FacebookIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

const WhatsAppIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const MailIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
  </svg>
);

const CopyIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5"/>
  </svg>
);

/* Clay pebble style for each icon */
const clayPebble = (color: string, bg: string): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 42,
  height: 42,
  borderRadius: 14,
  backgroundColor: bg,
  color,
  border: '1px solid rgba(255,255,255,0.6)',
  boxShadow: `
    5px 5px 12px rgba(0,0,0,0.08),
    -3px -3px 8px rgba(255,255,255,0.9),
    inset 2px 2px 4px rgba(255,255,255,0.7),
    inset -1px -1px 2px rgba(0,0,0,0.03)
  `,
  cursor: 'pointer',
  transition: 'all 0.25s ease',
});

const hoverShadow = '7px 7px 16px rgba(0,0,0,0.10), -4px -4px 10px rgba(255,255,255,0.9), inset 2px 2px 5px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)';

interface ShareButtonsProps {
  url: string;
  title: string;
  company: string;
}

export default function ShareButtons({ url, title, company }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  const encodedCompany = encodeURIComponent(company);
  const shareText = `${title} at ${company}`;

  const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
  const xUrl = `https://x.com/intent/tweet?text=${encodedTitle}%20at%20${encodedCompany}&url=${encodedUrl}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText + ' ' + url)}`;
  const emailUrl = `mailto:?subject=${encodedTitle}&body=Check%20out%20this%20PMHNP%20job:%20${url}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const openShareWindow = (shareUrl: string) => {
    window.open(shareUrl, '_blank', 'noopener,noreferrer,width=600,height=400');
  };

  const handleHover = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.transform = 'translateY(-3px)';
    e.currentTarget.style.boxShadow = hoverShadow;
  };
  const handleLeave = (e: React.MouseEvent<HTMLElement>, bg: string, color: string) => {
    e.currentTarget.style.transform = 'translateY(0)';
    e.currentTarget.style.boxShadow = clayPebble(color, bg).boxShadow as string;
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      {/* LinkedIn */}
      <button
        onClick={() => openShareWindow(linkedInUrl)}
        style={clayPebble('#0A66C2', '#E1EFFE')}
        onMouseEnter={handleHover}
        onMouseLeave={e => handleLeave(e, '#E1EFFE', '#0A66C2')}
        aria-label="Share on LinkedIn"
      >
        <LinkedInIcon />
      </button>

      {/* X (Twitter) */}
      <button
        onClick={() => openShareWindow(xUrl)}
        style={clayPebble('#1F2937', '#EDF2EE')}
        onMouseEnter={handleHover}
        onMouseLeave={e => handleLeave(e, '#EDF2EE', '#1F2937')}
        aria-label="Share on X"
      >
        <XIcon />
      </button>

      {/* Facebook */}
      <button
        onClick={() => {
          window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(window.location.href), 'facebook-share', 'width=600,height=400,scrollbars=yes,resizable=yes');
        }}
        style={clayPebble('#1877F2', '#E1EFFE')}
        onMouseEnter={handleHover}
        onMouseLeave={e => handleLeave(e, '#E1EFFE', '#1877F2')}
        aria-label="Share on Facebook"
      >
        <FacebookIcon />
      </button>

      {/* WhatsApp */}
      <button
        onClick={() => openShareWindow(whatsappUrl)}
        style={clayPebble('#25D366', '#DCFCE7')}
        onMouseEnter={handleHover}
        onMouseLeave={e => handleLeave(e, '#DCFCE7', '#25D366')}
        aria-label="Share on WhatsApp"
      >
        <WhatsAppIcon />
      </button>

      {/* Email */}
      <a
        href={emailUrl}
        style={{ ...clayPebble('#EA4335', '#FEE2E2'), textDecoration: 'none' }}
        onMouseEnter={handleHover}
        onMouseLeave={e => handleLeave(e, '#FEE2E2', '#EA4335')}
        aria-label="Share via Email"
      >
        <MailIcon />
      </a>

      {/* Copy Link */}
      <button
        onClick={handleCopyLink}
        style={copied
          ? { ...clayPebble('#059669', '#B2F5EA'),
              boxShadow: '2px 2px 6px rgba(13,148,136,0.15), inset 3px 3px 5px rgba(0,0,0,0.06), inset -1px -1px 3px rgba(255,255,255,0.4)' }
          : clayPebble('#6B7280', '#EDF2EE')
        }
        onMouseEnter={handleHover}
        onMouseLeave={e => handleLeave(e, copied ? '#B2F5EA' : '#EDF2EE', copied ? '#059669' : '#6B7280')}
        aria-label={copied ? 'Copied!' : 'Copy link'}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
    </div>
  );
}
