'use client';

import { useState, useRef, useEffect } from 'react';
import { 
  Share2, 
  X, 
  Link2, 
  Check,
  Twitter,
  Linkedin,
  Facebook,
  MessageCircle,
  Mail
} from 'lucide-react';

interface ShareMenuProps {
  url: string;
  title: string;
  description?: string;
  onClose: () => void;
}

export default function ShareMenu({ url, title, description, onClose }: ShareMenuProps) {
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  const encodedDescription = encodeURIComponent(description || '');

  const shareLinks = [
    {
      name: 'Twitter',
      icon: Twitter,
      color: 'hover:bg-sky-50 hover:text-sky-600',
      url: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
    },
    {
      name: 'LinkedIn',
      icon: Linkedin,
      color: 'hover:bg-blue-50 hover:text-blue-700',
      url: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    },
    {
      name: 'Facebook',
      icon: Facebook,
      color: 'hover:bg-indigo-50 hover:text-indigo-600',
      url: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    },
    {
      name: 'WhatsApp',
      icon: MessageCircle,
      color: 'hover:bg-green-50 hover:text-green-600',
      url: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`,
    },
    {
      name: 'Email',
      icon: Mail,
      color: 'hover:bg-gray-100 hover:text-gray-700',
      url: `mailto:?subject=${encodedTitle}&body=${encodedDescription}%0A%0A${encodedUrl}`,
    },
  ];

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleShare = (shareUrl: string) => {
    window.open(shareUrl, '_blank', 'width=600,height=400,noopener,noreferrer');
  };

  return (
    <div
      ref={menuRef}
      className="absolute z-50 bg-white rounded-xl shadow-xl border border-gray-200 p-4 w-64 animate-in fade-in slide-in-from-top-2 duration-200"
      style={{ top: '100%', right: 0, marginTop: '8px' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-100">
        <span className="font-semibold text-gray-900">Share this job</span>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 rounded-full transition-colors"
          aria-label="Close"
        >
          <X size={16} className="text-gray-500" />
        </button>
      </div>

      {/* Social Links */}
      <div className="space-y-1 mb-3">
        {shareLinks.map((link) => (
          <button
            key={link.name}
            onClick={() => handleShare(link.url)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 transition-colors ${link.color}`}
          >
            <link.icon size={20} />
            <span className="font-medium">{link.name}</span>
          </button>
        ))}
      </div>

      {/* Copy Link */}
      <div className="pt-3 border-t border-gray-100">
        <button
          onClick={handleCopyLink}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 font-medium transition-colors"
        >
          {copied ? (
            <>
              <Check size={18} className="text-green-600" />
              <span className="text-green-600">Link Copied!</span>
            </>
          ) : (
            <>
              <Link2 size={18} />
              <span>Copy Link</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

