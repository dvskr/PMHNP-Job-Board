'use client';

import { useState } from 'react';
import { Linkedin, Twitter, Mail, Link, Check } from 'lucide-react';

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

  const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodedTitle}%20at%20${encodedCompany}&url=${encodedUrl}`;
  const emailUrl = `mailto:?subject=${encodedTitle}&body=Check%20out%20this%20PMHNP%20job:%20${url}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
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
        <Linkedin size={20} />
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs font-medium text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          Share on LinkedIn
        </span>
      </button>

      {/* Twitter/X */}
      <button
        onClick={() => openShareWindow(twitterUrl)}
        className="group relative p-2 rounded-lg text-gray-500 hover:text-black hover:bg-gray-100 transition-colors"
        aria-label="Share on X"
      >
        <Twitter size={20} />
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs font-medium text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          Share on X
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
        className={`group relative p-2 rounded-lg transition-colors ${
          copied
            ? 'text-emerald-600 bg-emerald-50'
            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
        }`}
        aria-label={copied ? 'Copied!' : 'Copy link'}
      >
        {copied ? <Check size={20} /> : <Link size={20} />}
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs font-medium text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          {copied ? 'Copied!' : 'Copy link'}
        </span>
      </button>
    </div>
  );
}

