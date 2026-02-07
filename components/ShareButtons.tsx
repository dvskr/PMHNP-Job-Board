'use client';

import { useState } from 'react';
import { Mail, Link2, Check } from 'lucide-react';

// Custom SVG icons for brand accuracy
const XIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const LinkedInIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

const FacebookIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

const WhatsAppIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

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
  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText + ' ' + url)}`;
  const emailUrl = `mailto:?subject=${encodedTitle}&body=Check%20out%20this%20PMHNP%20job:%20${url}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
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

  return (
    <div className="flex items-center gap-2">
      {/* LinkedIn */}
      <button
        onClick={() => openShareWindow(linkedInUrl)}
        className="group relative p-2 rounded-lg text-gray-500 hover:text-[#0A66C2] hover:bg-blue-50 transition-colors"
        aria-label="Share on LinkedIn"
      >
        <LinkedInIcon size={20} />
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs font-medium text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          Share on LinkedIn
        </span>
      </button>

      {/* X (Twitter) */}
      <button
        onClick={() => openShareWindow(xUrl)}
        className="group relative p-2 rounded-lg text-gray-500 hover:text-black hover:bg-gray-100 transition-colors"
        aria-label="Share on X"
      >
        <XIcon size={20} />
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs font-medium text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          Share on X
        </span>
      </button>

      {/* Facebook */}
      <button
        onClick={() => {
          window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(window.location.href), 'facebook-share', 'width=600,height=400,scrollbars=yes,resizable=yes');
        }}
        className="group relative p-2 rounded-lg text-gray-500 hover:text-[#1877F2] hover:bg-blue-50 transition-colors"
        aria-label="Share on Facebook"
      >
        <FacebookIcon size={20} />
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs font-medium text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          Share on Facebook
        </span>
      </button>

      {/* WhatsApp */}
      <button
        onClick={() => openShareWindow(whatsappUrl)}
        className="group relative p-2 rounded-lg text-gray-500 hover:text-[#25D366] hover:bg-green-50 transition-colors"
        aria-label="Share on WhatsApp"
      >
        <WhatsAppIcon size={20} />
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs font-medium text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          Share on WhatsApp
        </span>
      </button>

      {/* Email */}
      <a
        href={emailUrl}
        className="group relative p-2 rounded-lg text-gray-500 hover:text-red-500 hover:bg-red-50 transition-colors"
        aria-label="Share via Email"
      >
        <Mail size={20} />
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs font-medium text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          Share via Email
        </span>
      </a>

      {/* Copy Link */}
      <button
        onClick={handleCopyLink}
        className={`group relative p-2 rounded-lg transition-colors ${copied
          ? 'text-emerald-600 bg-emerald-50'
          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        aria-label={copied ? 'Copied!' : 'Copy link'}
      >
        {copied ? <Check size={20} /> : <Link2 size={20} />}
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs font-medium text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          {copied ? 'Copied!' : 'Copy link'}
        </span>
      </button>
    </div>
  );
}

