'use client';

import { useState, useCallback } from 'react';
import { Bookmark, Printer, Link2, BookOpen, Quote } from 'lucide-react';
import BlogEmailSignup from '@/components/BlogEmailSignup';

interface EditorialToolbarProps {
  slug: string;
  title: string;
  url: string;
}

export default function EditorialToolbar({ slug, title, url }: EditorialToolbarProps) {
  const [bookmarked, setBookmarked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cited, setCited] = useState(false);
  const [font, setFont] = useState<'serif' | 'sans'>('serif');
  const [size, setSize] = useState<'sm' | 'md' | 'lg' | 'xl'>('md');

  const handleBookmark = useCallback(() => {
    setBookmarked((prev) => !prev);
  }, []);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [url]);

  const handleCite = useCallback(async () => {
    const citation = `PMHNP Hiring Editorial Team. "${title}". PMHNP Hiring, ${new Date().getFullYear()}. ${url}`;
    try {
      await navigator.clipboard.writeText(citation);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = citation;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCited(true);
    setTimeout(() => setCited(false), 2000);
  }, [title, url]);

  // Toggle font on the prose element
  const handleFont = useCallback((f: 'serif' | 'sans') => {
    setFont(f);
    const prose = document.querySelector('.editorial-prose');
    if (prose) {
      prose.classList.toggle('ed-sans', f === 'sans');
    }
  }, []);

  // Toggle text size on the prose element
  const handleSize = useCallback((s: 'sm' | 'md' | 'lg' | 'xl') => {
    setSize(s);
    const prose = document.querySelector('.editorial-prose');
    if (prose) {
      prose.classList.remove('ed-text-sm', 'ed-text-md', 'ed-text-lg', 'ed-text-xl');
      prose.classList.add(`ed-text-${s}`);
    }
  }, []);

  return (
    <div className="ed-right-sticky">
      <div className="ed-toolbar">
        <div className="ed-toolbar-inner">
          {/* Tools */}
          <div className="ed-toolbar-section">
            <div className="ed-toolbar-label">Tools</div>
            <div className="ed-floating-tools">
              <button
                className={`ed-tool-btn ${bookmarked ? 'active' : ''}`}
                onClick={handleBookmark}
                aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark article'}
              >
                <Bookmark size={14} fill={bookmarked ? 'currentColor' : 'none'} />
                {bookmarked ? 'Saved' : 'Bookmark'}
              </button>
              <button className="ed-tool-btn" onClick={handlePrint} aria-label="Print article">
                <Printer size={14} />
                Print
              </button>
              <button className="ed-tool-btn" onClick={handleCopyLink} aria-label="Copy link">
                <Link2 size={14} />
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
              <button className={`ed-tool-btn ${cited ? 'active' : ''}`} onClick={handleCite} aria-label="Cite this article">
                <Quote size={14} />
                {cited ? 'Cited!' : 'Cite This'}
              </button>
            </div>
          </div>

          {/* Display */}
          <div className="ed-toolbar-section">
            <div className="ed-toolbar-label">Display</div>
            <div className="ed-font-toggle">
              <button
                className={font === 'serif' ? 'ed-toggle-active' : ''}
                onClick={() => handleFont('serif')}
                style={{ fontFamily: 'Georgia, serif' }}
              >
                Serif
              </button>
              <button
                className={font === 'sans' ? 'ed-toggle-active' : ''}
                onClick={() => handleFont('sans')}
              >
                Sans
              </button>
            </div>
            <div className="ed-size-toggle">
              {(['sm', 'md', 'lg', 'xl'] as const).map((s) => (
                <button
                  key={s}
                  className={size === s ? 'ed-toggle-active' : ''}
                  onClick={() => handleSize(s)}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
          </div>



        </div>
      </div>

      {/* Sidebar Newsletter */}
      <div className="ed-sidebar-newsletter">
        <div className="ed-newsletter-kicker">
          <BookOpen size={12} style={{ display: 'inline', marginRight: 4 }} />
          The PMHNP Dispatch
        </div>
        <h4 className="ed-sidebar-newsletter-title">
          Clinical <em>insights</em>, delivered weekly
        </h4>
        <p className="ed-sidebar-newsletter-desc">
          Career strategies, salary data, and evidence-based practice updates for PMHNPs.
        </p>
        <div className="ed-newsletter-form">
          <BlogEmailSignup source={`blog_sidebar_${slug}`} />
        </div>
        <p className="ed-newsletter-fineprint">Unsubscribe anytime · No spam</p>
      </div>
    </div>
  );
}
