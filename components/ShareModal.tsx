'use client';

import { useState, useEffect } from 'react';
import { Mail, Link2, Check, X } from 'lucide-react';
import { createPortal } from 'react-dom';

// Custom SVG icons for brand accuracy
const XIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const LinkedInIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

const FacebookIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

const WhatsAppIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const SMSIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);

interface ShareModalProps {
  url: string;
  title: string;
  description?: string;
  onClose: () => void;
}

export default function ShareModal({ url, title, description = '', onClose }: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const shareOptions = [
    {
      name: 'X',
      icon: <XIcon size={24} />,
      href: `https://x.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
      color: 'hover:bg-gray-100 text-gray-700',
    },
    {
      name: 'LinkedIn',
      icon: <LinkedInIcon size={24} />,
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
      color: 'hover:bg-blue-50 text-[#0A66C2]',
    },
    {
      name: 'Facebook',
      icon: <FacebookIcon size={24} />,
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
      color: 'hover:bg-blue-50 text-[#1877F2]',
    },
    {
      name: 'WhatsApp',
      icon: <WhatsAppIcon size={24} />,
      href: `https://wa.me/?text=${encodeURIComponent(title + ' ' + url)}`,
      color: 'hover:bg-green-50 text-[#25D366]',
    },
    {
      name: 'SMS',
      icon: <SMSIcon size={24} />,
      href: `sms:?body=${encodeURIComponent(title + ' ' + url)}`,
      color: 'hover:bg-green-50 text-green-600',
    },
    {
      name: 'Email',
      icon: <Mail size={24} />,
      href: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent((description || 'Check out this job opportunity!') + '\n\n' + url)}`,
      color: 'hover:bg-red-50 text-red-500',
    },
  ];

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        onClose();
      }, 1500);
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        onClose();
      }, 1500);
    }
  };

  const openShareWindow = (href: string) => {
    // For SMS and mailto, just open directly
    if (href.startsWith('sms:') || href.startsWith('mailto:')) {
      window.location.href = href;
    } else if (href.includes('facebook.com')) {
      window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(window.location.href), 'facebook-share', 'width=600,height=400,scrollbars=yes,resizable=yes');
    } else {
      window.open(href, '_blank', 'width=600,height=400,noopener,noreferrer');
    }
    onClose();
  };

  if (!mounted) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative bg-white w-full max-w-sm mx-4 sm:mx-auto rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">Share</h3>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Share Icons - Two Rows */}
        <div className="px-3 py-4">
          {/* Row 1 */}
          <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: '12px' }}>
            {shareOptions.slice(0, 4).map((option) => (
              <button
                key={option.name}
                onClick={() => openShareWindow(option.href)}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '8px', borderRadius: '12px', minWidth: '64px' }}
                className={`transition-colors ${option.color}`}
              >
                <div style={{ width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', backgroundColor: '#f3f4f6' }}>
                  {option.icon}
                </div>
                <span style={{ fontSize: '11px', fontWeight: 500, color: '#4b5563' }}>{option.name}</span>
              </button>
            ))}
          </div>
          {/* Row 2 */}
          <div style={{ display: 'flex', justifyContent: 'space-around' }}>
            {shareOptions.slice(4).map((option) => (
              <button
                key={option.name}
                onClick={() => openShareWindow(option.href)}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '8px', borderRadius: '12px', minWidth: '64px' }}
                className={`transition-colors ${option.color}`}
              >
                <div style={{ width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', backgroundColor: '#f3f4f6' }}>
                  {option.icon}
                </div>
                <span style={{ fontSize: '11px', fontWeight: 500, color: '#4b5563' }}>{option.name}</span>
              </button>
            ))}
            {/* Copy Link */}
            <button
              onClick={handleCopyLink}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '8px', borderRadius: '12px', minWidth: '64px' }}
              className={`transition-colors ${copied ? 'text-emerald-600' : 'hover:bg-gray-100 text-gray-700'}`}
            >
              <div style={{
                width: '48px',
                height: '48px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                backgroundColor: copied ? '#d1fae5' : '#f3f4f6'
              }}>
                {copied ? <Check size={24} /> : <Link2 size={24} />}
              </div>
              <span style={{ fontSize: '11px', fontWeight: 500 }}>{copied ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
