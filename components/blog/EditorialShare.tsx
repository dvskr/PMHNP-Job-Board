'use client';

import { Twitter, Linkedin, Facebook, Mail, Link2 } from 'lucide-react';
import { useState, useCallback } from 'react';

interface EditorialShareProps {
  title: string;
  url: string;
}

export default function EditorialShare({ title, url }: EditorialShareProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [url]);

  return (
    <div className="ed-share">
      <span className="ed-share-label">Share</span>
      <div className="ed-share-links">
        <a
          href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ed-share-btn"
          aria-label="Share on Twitter"
        >
          <Twitter />
        </a>
        <a
          href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ed-share-btn"
          aria-label="Share on LinkedIn"
        >
          <Linkedin />
        </a>
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ed-share-btn"
          aria-label="Share on Facebook"
        >
          <Facebook />
        </a>
        <a
          href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`}
          className="ed-share-btn"
          aria-label="Share via email"
        >
          <Mail />
        </a>
        <button
          className="ed-share-btn"
          onClick={handleCopy}
          aria-label={copied ? 'Link copied' : 'Copy link'}
        >
          <Link2 />
        </button>
      </div>
    </div>
  );
}
